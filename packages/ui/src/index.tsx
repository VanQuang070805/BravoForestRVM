import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Button({ children, tone = 'dark', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'dark' | 'lime' | 'light' }) {
  return <button className={`button button-${tone} ${className}`} {...props}>{children}</button>;
}
export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLElement>) { return <section className={`card ${className}`} {...props}>{children}</section>; }
export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'green' | 'amber' | 'red' }) { return <span className={`pill pill-${tone}`}>{children}</span>; }
export function Metric({ label, value, detail, icon = '↗' }: { label: string; value: string; detail: string; icon?: string }) { return <Card className="metric"><div className="metric-top"><span>{label}</span><span className="metric-icon" aria-hidden="true">{icon}</span></div><strong>{value}</strong><small>{detail}</small></Card>; }
export function Field({ label, name, type = 'text', ...inputProps }: InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="field"><span>{label}</span><input {...inputProps} name={name ?? label.toLowerCase().replaceAll(' ','_')} type={type} /></label>; }
export function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
