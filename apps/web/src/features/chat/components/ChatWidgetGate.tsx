'use client';

import { usePathname } from 'next/navigation';
import { showChatWidget } from '../chat-widget-visibility';
import { ChatWidget } from './ChatWidget';

/** The dashboard's chat widget, minus the routes that must stay distraction-free. */
export function ChatWidgetGate() {
  const pathname = usePathname();
  return showChatWidget(pathname) ? <ChatWidget /> : null;
}
