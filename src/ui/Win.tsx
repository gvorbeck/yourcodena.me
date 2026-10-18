import { useId, type ReactNode, type Ref } from 'react';

// Apart from ui/index.tsx so pages that need no form controls don't pull in react-aria-components.
interface WinProps { title: string; className?: string; right?: ReactNode; children: ReactNode; headingRef?: Ref<HTMLHeadingElement> }

export const Win = ({ title, right, children, headingRef, className }: WinProps) => {
  const id = useId();
  return (
    <section className={className ? `win ${className}` : 'win'} aria-labelledby={id}>
      <header><h2 id={id} tabIndex={headingRef ? -1 : undefined} ref={headingRef}>{title}</h2><span>{right}</span></header>
      <div className="body">{children}</div>
    </section>
  );
};

/** First tab stop: jumps past the menu bar to the page's <main id="main">. */
export const SkipLink = () => (
  <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
);
