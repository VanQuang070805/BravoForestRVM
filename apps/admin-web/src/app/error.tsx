'use client';
export default function ErrorState({reset}:{error:Error;reset:()=>void}){return <main className="admin-content"><div className="card"><h2>Không thể tải màn hình</h2><button className="button button-dark" onClick={reset}>Thử lại</button></div></main>}
