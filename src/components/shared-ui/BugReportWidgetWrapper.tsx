/**
 * Server component wrapper for BugReportWidget.
 *
 * Usage:
 *   import { BugReportWidgetWrapper } from '@/components/shared-ui/BugReportWidgetWrapper';
 *   <BugReportWidgetWrapper userId="user-123" userName="Jane Doe" />
 *
 * Or with no props for anonymous reporting:
 *   <BugReportWidgetWrapper />
 */

import { BugReportWidget } from './BugReportWidget';

interface BugReportWidgetWrapperProps {
  userId?: string;
  userName?: string;
  userEmail?: string;
}

export function BugReportWidgetWrapper({
  userId = 'anonymous',
  userName,
  userEmail,
}: BugReportWidgetWrapperProps) {
  return (
    <BugReportWidget
      userId={userId}
      userName={userName}
      userEmail={userEmail}
    />
  );
}
