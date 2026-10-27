import Link from 'next/link';
import { ArrowRight, CheckCircle2, CircleAlert, MailCheck, ShieldCheck } from 'lucide-react';
import styles from './AuthNotice.module.scss';

type Props = { message: string; kind: 'success' | 'error' | 'info'; mode: string };
export default function AuthNotice({ message, kind, mode }: Props) {
  if (!message) return null;
  const email = kind === 'success' && ['register', 'recover'].includes(mode);
  const Icon =
    kind === 'error'
      ? CircleAlert
      : email
        ? MailCheck
        : kind === 'info'
          ? ShieldCheck
          : CheckCircle2;
  const title =
    kind === 'error'
      ? "We couldn't complete that"
      : email
        ? 'Check your inbox'
        : kind === 'info'
          ? 'One more security step'
          : 'Password updated';
  return (
    <div
      className={`${styles.notice} ${styles[kind]}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
    >
      <span className={styles.icon}>
        <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className={styles.content}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>
        {email && (
          <p className={styles.hint}>Can’t find the email? Check your spam or junk folder.</p>
        )}
        {kind === 'success' && (
          <Link
            className={styles.action}
            href={mode === 'reset' ? '/workspace/farmer' : '/auth/login'}
          >
            {mode === 'register'
              ? 'Continue to sign in'
              : mode === 'recover'
                ? 'Back to sign in'
                : 'Open your workspace'}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}
