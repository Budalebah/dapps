import React, { useEffect, useState } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import {
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Dialog,
  DialogActions,
  DialogContent,
  ListItemText,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { Loader } from '../../../../components/Loader';
import { getInstance, getPublicKeySignature } from '../../../../wallet';
import { Game } from '../../types';
import { GAME_STATE } from '../../constants';

const STATE = ['Pending', 'Won', 'Lost'];

export type Bet = {
  amount: number;
  option: bigint;
  state: bigint;
};

export const BetAction: React.FC<{
  game: Game;
  gameId: number;
  abi: any;
  account: string;
  contract: Contract;
  erc20Contract: Contract;
  provider: BrowserProvider;
}> = ({ game, gameId, abi, account, contract, erc20Contract, provider }) => {
  const [currentBet, setCurrentBet] = useState<Bet | null>(null);
  const [symbol, setSymbol] = useState('');
  const [bettingAmount, setBettingAmount] = useState('');
  const [loading, setLoading] = useState<string>('');
  const [dialog, setDialog] = useState('');

  useEffect(() => {
    erc20Contract.symbol().then(setSymbol);
  }, []);

  const bet = async () => {
    const value = parseInt(bettingAmount, 10);
    if (!value || Number.isNaN(value)) return;

    try {
      setLoading(`Encrypting "${value}" and generating ZK proof...`);
      const encryptedErc20Value = getInstance().encrypt32(value);
      setLoading('Sending ERC-20 approve transaction');
      const erc20Transaction = await erc20Contract.approve(await contract.getAddress(), encryptedErc20Value);
      setLoading('Waiting for ERC-20 approve transaction validation...');
      await provider.waitForTransaction(erc20Transaction.hash);

      setLoading(`Encrypting "${value}" and generating ZK proof...`);
      const encryptedValue = getInstance().encrypt32(value);
      setLoading('Sending bet transaction...');

      const transaction = await contract.placeBet(gameId, encryptedValue);
      setLoading('Waiting for bet transaction validation...');
      await provider.waitForTransaction(transaction.hash);
      setLoading('');
      setDialog(`You bet ${value} token${value > 1 ? 's' : ''}!`);
    } catch (e) {
      console.log(e);
      setLoading('');
      setDialog('Error during betting!');
    }
  };

  const withdraw = async () => {
    try {
      setLoading('Sending withdraw transaction...');
      const transaction = await contract.withdraw(gameId);
      setLoading('Waiting for withdraw transaction validation...');
      await provider.waitForTransaction(transaction.hash);
      setLoading('Refresh bet...');
      await getCurrentBet();
      setLoading('');
    } catch (e) {
      console.log(e);
      setLoading('');
      setDialog('Error during withdraw!');
    }
  };

  const getCurrentBet = async () => {
    try {
      const contractAddress = await contract.getAddress();
      const { publicKey, signature } = await getPublicKeySignature(contractAddress, account);
      const response = await contract.getBet(gameId, publicKey, signature);
      const bet = response.toObject();
      const betAmount = getInstance().decrypt(contractAddress, bet.amount);
      setCurrentBet({ ...bet, amount: betAmount });
    } catch (e) {
      console.log(e);
      setDialog('No bet!');
    }
  };

  let amount = '-';
  let state = '-';

  if (currentBet) {
    amount = `${currentBet.amount} ${symbol}`;
    state = STATE[+currentBet.state.toString()];
  }

  const handleClose = () => setDialog('');
  console.log(currentBet);
  return (
    <>
      <CardHeader title="My Bet" />
      <CardContent>
        <ListItemText primary="Amount" secondary={amount} />
        <ListItemText primary="State" secondary={state} />
      </CardContent>
      <CardActions>
        {!loading && <Button onClick={getCurrentBet}>Get my current bet</Button>}
        <Loader message={loading} />
      </CardActions>
      <CardActions>
        {game.state === GAME_STATE['OPEN'] && !loading && (
          <>
            <TextField
              size="small"
              variant="outlined"
              value={bettingAmount}
              onChange={(e) => setBettingAmount(e.target.value)}
              type="number"
            />
            <Button onClick={bet} variant="contained">
              Bet
            </Button>
          </>
        )}
        {game.state !== GAME_STATE['OPEN'] && currentBet && currentBet.state === 0n && !loading && (
          <>
            <Button onClick={withdraw} variant="contained">
              Withdraw
            </Button>
          </>
        )}
      </CardActions>

      <Dialog
        open={dialog !== ''}
        onClose={handleClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogContent>{dialog}</DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>OK</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
