'use client';

import React from 'react';
import AdminLoginShell from './AdminLoginShell';

interface AdminLoginGateProps {
  onLoginSuccess?: (token: string) => void;
  checkingAuth?: boolean;
}

export const AdminLoginGate: React.FC<AdminLoginGateProps> = ({
  onLoginSuccess = () => {},
  checkingAuth = false,
}) => {
  return (
    <AdminLoginShell
      onLoginSuccess={(token: string) => onLoginSuccess(token)}
      checkingAuth={checkingAuth}
    />
  );
};

export default AdminLoginGate;
