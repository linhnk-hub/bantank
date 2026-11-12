/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LandingPage } from './LandingPage.tsx';

export interface WelcomeScreenProps {
  onSignIn: () => Promise<void>;
  onStartTrialMode?: () => void;
  onEnterGame?: () => void;
  currentUser?: {
    uid?: string;
    email: string | null;
    displayName?: string | null;
    photoURL?: string | null;
  } | null;
  isProcessing: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  onClearFeedback: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSignIn,
  onStartTrialMode,
  onEnterGame,
  currentUser = null,
  isProcessing,
  errorMessage,
  successMessage,
  onClearFeedback,
}) => {
  return (
    <LandingPage
      currentUser={currentUser}
      onSignIn={onSignIn}
      onEnterGame={onEnterGame}
      onStartTrialMode={onStartTrialMode}
      isProcessing={isProcessing}
      errorMessage={errorMessage}
      successMessage={successMessage}
      onClearFeedback={onClearFeedback}
    />
  );
};

