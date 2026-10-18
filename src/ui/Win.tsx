import type { ReactNode, Ref } from 'react';

// Apart from ui/index.tsx so pages that need no form controls don't pull in react-aria-components.
interface WinProps { title: string; className?: string; right?: ReactNode; children: ReactNode; headingRef?: Ref<HTMLHeadingElement> }

export const Win = ({ title, right, children, headingRef, className }: WinProps) => (
  <section className={className ? `win ${className}` : 'win'}>
    <header><h2 tabIndex={headingRef ? -1 : undefined} ref={headingRef}>{title}</h2><span>{right}</span></header>
    <div className="body">{children}</div>
  </section>
);
