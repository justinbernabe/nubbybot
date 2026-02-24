import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { LogsPage } from '@/components/logs/LogsPage';
import { PromptsPage } from '@/components/prompts/PromptsPage';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ChatPage } from '@/components/chat/ChatPage';
import { LoginPage } from '@/components/login/LoginPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/prompts" element={<PromptsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/chat" element={<ChatPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
