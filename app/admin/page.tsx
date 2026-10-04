'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

type DashboardData = {
  trolleys: any[];
  orders: any[];
};

const money = (value: any) =>
  `₹${Number(value || 0).toLocaleString(
    'en-IN',
  )}`;

export default function AdminPage() {
  const router = useRouter();

  const [data, setData] =
    useState<DashboardData>({
      trolleys: [],
      orders: [],
    });

  const [busy, setBusy] =
    useState(false);

  const [pendingOrderId, setPendingOrderId] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [dashboardError, setDashboardError] =
    useState('');

  const [exporting, setExporting] =
    useState<string>('');

  const [trolleyDialog, setTrolleyDialog] =
    useState<{mode:'create'|'status';trolleyId?:string;status?:'AVAILABLE'|'DAMAGED';currentStatus?:string;name?:string;id?:string;reason?:string}|null>(null);

  const [trolleyBusy, setTrolleyBusy] =
    useState(false);

  const [trolleyActionError, setTrolleyActionError] =
    useState('');

  async function load(showFeedback = false) {
    if (showFeedback) setRefreshing(true);
    setDashboardError('');

    try {
      const response = await fetch(
        '/api/admin/dashboard',
        {
          cache: 'no-store',
        },
      );

      if (response.status === 401) {
        router.replace('/');
        return;
      }

      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || 'Unable to load the dashboard.');
      }
      setData(json.data);
    } catch (error) {
      setDashboardError(
        error instanceof Error ? error.message : 'Unable to load the dashboard.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();

    const timer = setInterval(
      load,
      8000,
    );

    return () =>
      clearInterval(timer);
  }, []);

  const stats = useMemo(
    () => ({
      available:
        data.trolleys.filter(
          (item) =>
            item.status ===
            'AVAILABLE',
        ).length,

      inUse:
        data.trolleys.filter(
          (item) =>
            item.status === 'IN_USE',
        ).length,

      pending:
        data.trolleys.filter(
          (item) =>
            item.status ===
            'PAYMENT_PENDING',
        ).length,

      paid:
        data.trolleys.filter(
          (item) =>
            item.status === 'PAID' ||
            item.status ===
              'RETURN_PENDING',
        ).length,
    }),
    [data],
  );

  async function confirmPayment(
    orderId: string,
  ) {
    if (
      !confirm(
        'Confirm payment received?',
      )
    ) {
      return;
    }

    setBusy(true);
    setPendingOrderId(orderId);

    try {
      const response = await fetch(
        '/api/admin/action',
        {
          method: 'POST',
          headers: {
            'content-type':
              'application/json',
          },
          body: JSON.stringify({
            action:
              'CONFIRM_PAYMENT',
            payload: {
              orderId,
            },
          }),
        },
      );

      const json =
        await response.json();

      if (!json.ok) {
        alert(
          json.error ||
            'Payment confirmation failed.',
        );
        return;
      }

      await load(true);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : 'Payment confirmation failed.',
      );
    } finally {
      setBusy(false);
      setPendingOrderId('');
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
    } finally {
      router.replace('/');
    }
  }

  function addTrolley() {
    const largest = data.trolleys.reduce((max:number,trolley:any)=>{
      const match=String(trolley.trolleyId||trolley.id||'').match(/(\d+)$/);
      return match?Math.max(max,Number(match[1])):max;
    },0);
    const suffix=String(largest+1).padStart(3,'0');
    setTrolleyActionError('');
    setTrolleyDialog({mode:'create',name:`Trolley ${suffix}`,id:`SM-TROLLEY-${suffix}`});
  }

  async function saveTrolley() {
    if(!trolleyDialog)return;
    setTrolleyBusy(true);
    setTrolleyActionError('');
    try{
      const action=trolleyDialog.mode==='create'?'CREATE_TROLLEY':'SET_TROLLEY_STATUS';
      const payload=trolleyDialog.mode==='create'
        ?{name:trolleyDialog.name,trolleyId:trolleyDialog.id}
        :{trolleyId:trolleyDialog.trolleyId,status:trolleyDialog.status,reason:trolleyDialog.reason};
      const response=await fetch('/api/admin/action',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({action,payload}),
      });
      if(response.status===401){router.replace('/');return}
      const json=await response.json();
      if(!json.ok)throw new Error(json.error||'Unable to update trolley.');
      setTrolleyDialog(null);
      await load(true);
    }catch(error){
      setTrolleyActionError(error instanceof Error?error.message:'Unable to update trolley.');
    }finally{
      setTrolleyBusy(false);
    }
  }

  function setTrolleyStatus(trolley:any,status:'AVAILABLE'|'DAMAGED'){
    setTrolleyActionError('');
    const currentStatus=String(trolley.status||'');
    setTrolleyDialog({
      mode:'status',
      trolleyId:String(trolley.trolleyId||trolley.id),
      name:String(trolley.name||trolley.trolleyId||trolley.id),
      currentStatus,
      status,
      reason:status==='DAMAGED'?'Equipment damaged':currentStatus==='DAMAGED'?'Repaired and inspected':'Customer left trolley',
    });
  }

  async function downloadExport(
    type:
      | 'products'
      | 'trolleys',
  ) {
    try {
      setExporting(type);

      const response = await fetch(
        `/api/admin/export/${type}`,
        {
          method: 'GET',
        },
      );

      if (
        response.status === 401
      ) {
        router.replace('/');
        return;
      }

      if (!response.ok) {
        let message =
          'Export failed.';

        try {
          const json =
            await response.json();

          message =
            json.error || message;
        } catch {}

        alert(message);
        return;
      }

      const blob =
        await response.blob();

      const url =
        URL.createObjectURL(blob);

      const anchor =
        document.createElement(
          'a',
        );

      anchor.href = url;

      anchor.download =
        type === 'products'
          ? 'Smark-Mart-Products.zip'
          : 'Smark-Mart-Trolleys.zip';

      document.body.appendChild(
        anchor,
      );

      anchor.click();

      anchor.remove();

      URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(
        error?.message ||
          'Export failed.',
      );
    } finally {
      setExporting('');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <img
            className="h-12 w-12 rounded-xl object-cover"
            src="/smark-mart-icon.png"
            alt="Smark Mart"
          />

          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              Smark Mart Console
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Live store operations
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          <a
            className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800"
            href="/admin"
          >
            Admin
          </a>

          <a className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" href="/admin/products">
            Products
          </a>

          <a className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" href="/admin/barcodes">
            Barcodes
          </a>

          <button
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={logout}
          >
            Logout
          </button>
        </nav>
      </header>

      {dashboardError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">
          {dashboardError}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy={loading}>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loading ? <div className="skeleton-shimmer h-8 w-14 rounded" /> : (
            <b className="block text-2xl font-black text-slate-950">{stats.available}</b>
          )}

          <span className="mt-1 block text-sm font-medium text-slate-500">
            Available
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loading ? <div className="skeleton-shimmer h-8 w-14 rounded" /> : (
            <b className="block text-2xl font-black text-slate-950">{stats.inUse}</b>
          )}

          <span className="mt-1 block text-sm font-medium text-slate-500">
            In Use
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loading ? <div className="skeleton-shimmer h-8 w-14 rounded" /> : (
            <b className="block text-2xl font-black text-slate-950">{stats.pending}</b>
          )}

          <span className="mt-1 block text-sm font-medium text-slate-500">
            Payment Pending
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loading ? <div className="skeleton-shimmer h-8 w-14 rounded" /> : (
            <b className="block text-2xl font-black text-slate-950">{stats.paid}</b>
          )}

          <span className="mt-1 block text-sm font-medium text-slate-500">
            Paid / Return
          </span>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Export Scan Assets
            </h2>

            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Download master data,
              QR codes and printable
              CODE128 barcodes.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <article className="relative grid grid-cols-[auto_1fr] gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 sm:p-5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-2xl">
              🛒
            </div>

            <div>
              <h3 className="font-bold text-slate-900">
                Trolley Package
              </h3>

              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Includes trolleys.csv,
                QR images and barcode
                PNG files.
              </p>
            </div>

            <button
              className="col-span-2 mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-55"
              disabled={
                Boolean(exporting)
              }
              onClick={() =>
                downloadExport(
                  'trolleys',
                )
              }
            >
              {exporting === 'trolleys' && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              )}
              {exporting ===
              'trolleys'
                ? 'Preparing ZIP…'
                : 'Download Trolleys ZIP'}
            </button>
          </article>

          <article className="relative grid grid-cols-[auto_1fr] gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 sm:p-5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-2xl">
              📦
            </div>

            <div>
              <h3 className="font-bold text-slate-900">
                Product Package
              </h3>

              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Includes products.csv,
                QR images and scannable
                barcode PNG files.
              </p>
            </div>

            <button
              className="col-span-2 mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-55"
              disabled={
                Boolean(exporting)
              }
              onClick={() =>
                downloadExport(
                  'products',
                )
              }
            >
              {exporting === 'products' && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              )}
              {exporting ===
              'products'
                ? 'Preparing ZIP…'
                : 'Download Products ZIP'}
            </button>
          </article>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Trolleys</h2>

            <p className="mt-1 text-sm text-slate-500">
              Current live status
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-teal-800 disabled:opacity-55" onClick={() => load(true)} disabled={refreshing}>
              {refreshing && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-bold text-teal-800 transition hover:-translate-y-0.5 hover:bg-teal-100" type="button" onClick={addTrolley}>
              + Add Trolley
            </button>
          </div>
        </div>

        {trolleyActionError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">
            {trolleyActionError}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading trolleys">
            {[0, 1, 2].map((item) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={item}>
                <div className="skeleton-shimmer h-4 w-36 rounded" />
                <div className="mt-3 flex justify-between gap-3">
                  <div className="skeleton-shimmer h-3 w-24 rounded" />
                  <div className="skeleton-shimmer h-6 w-24 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.trolleys.map(
            (trolley) => (
              <article
                className="flex min-w-0 flex-col items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4 md:flex-row md:items-center md:justify-between md:gap-3"
                key={
                  trolley.trolleyId ||
                  trolley.id
                }
              >
                <div className="w-full min-w-0 md:flex-1">
                  <h3 className="truncate font-bold text-slate-900">
                    {trolley.name||trolley.trolleyId||
                  trolley.id}
                  </h3>

                  <p className="mt-1 truncate text-xs text-slate-500">
                    {trolley.trolleyId||trolley.id}
                  </p>
                </div>

                <span
                  className={`max-w-full self-start whitespace-normal break-words rounded-full px-2.5 py-1 text-center text-[10px] font-black md:max-w-[45%] ${
                    trolley.status === 'AVAILABLE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : trolley.status === 'IN_USE'
                        ? 'bg-blue-100 text-blue-800'
                        : trolley.status === 'PAYMENT_PENDING'
                          ? 'bg-orange-100 text-orange-800'
                          : trolley.status === 'PAID'
                            ? 'bg-violet-100 text-violet-800'
                            : trolley.status === 'DAMAGED'
                              ? 'bg-red-100 text-red-800'
                                : trolley.status === 'MAINTENANCE'
                                  ? 'bg-orange-100 text-orange-900'
                                  : trolley.status === 'RETURN_PENDING'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {trolley.status}
                </span>
                <div className="flex w-full shrink-0 flex-wrap gap-2 md:w-auto md:flex-col">
                  {(trolley.status==='IN_USE'||trolley.status==='PAYMENT_PENDING')&&(
                    <>
                      <button className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-50" type="button" onClick={()=>setTrolleyStatus(trolley,'AVAILABLE')}>
                        Release
                      </button>
                      <button className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-800 transition hover:bg-amber-50" type="button" onClick={()=>setTrolleyStatus(trolley,'DAMAGED')}>
                        Mark Damaged
                      </button>
                    </>
                  )}
                  {trolley.status==='AVAILABLE'&&(
                    <button className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-800 transition hover:bg-amber-50" type="button" onClick={()=>setTrolleyStatus(trolley,'DAMAGED')}>
                      Mark Damaged
                    </button>
                  )}
                  {(trolley.status==='DAMAGED'||trolley.status==='MAINTENANCE')&&(
                    <button className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-50" type="button" onClick={()=>setTrolleyStatus(trolley,'AVAILABLE')}>
                      {trolley.status==='MAINTENANCE'?'Mark Repaired':'Restore'}
                    </button>
                  )}
                </div>
              </article>
            ),
          )}
        </div>
        )}
      </section>

      {trolleyDialog && (
        <div className="animate-fade-in fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event)=>{if(event.currentTarget===event.target&&!trolleyBusy)setTrolleyDialog(null)}}>
          <form className="animate-rise-in my-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7" onSubmit={(event)=>{event.preventDefault();saveTrolley()}}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  {trolleyDialog.mode==='create'?'Add Trolley':trolleyDialog.status==='DAMAGED'?'Mark Trolley Damaged':trolleyDialog.currentStatus==='DAMAGED'?'Restore Trolley':'Release Trolley'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {trolleyDialog.mode==='create'?'Add a trolley to the live inventory.':`Trolley: ${trolleyDialog.name}`}
                </p>
              </div>
              <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-xl text-slate-500 transition hover:bg-slate-100" type="button" disabled={trolleyBusy} onClick={()=>setTrolleyDialog(null)} aria-label="Close trolley dialog">×</button>
            </div>

            {trolleyDialog.mode==='create'?(
              <div className="mt-5 grid gap-4">
                <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                  Trolley Name
                  <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" required maxLength={80} value={trolleyDialog.name||''} onChange={(event)=>setTrolleyDialog({...trolleyDialog,name:event.target.value})} placeholder="Trolley 001" />
                </label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                  Trolley ID
                  <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal uppercase outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" required minLength={2} maxLength={64} pattern="[A-Za-z0-9_-]+" value={trolleyDialog.id||''} onChange={(event)=>setTrolleyDialog({...trolleyDialog,id:event.target.value.toUpperCase()})} placeholder="Auto-generated ID" />
                  <small className="block font-normal text-slate-500">Suggested automatically; edit it if your trolley uses a different ID.</small>
                </label>
              </div>
            ):(
              <div className="mt-5 space-y-4">
                <div className={`rounded-xl p-4 text-sm leading-relaxed ${trolleyDialog.status==='DAMAGED'?'bg-amber-50 text-amber-900':'bg-emerald-50 text-emerald-900'}`}>
                  {trolleyDialog.status==='DAMAGED'
                    ?'This trolley will be marked damaged and hidden from customer use.'
                    :'This trolley will be made available again.'}
                  {(trolleyDialog.status==='AVAILABLE'&&['IN_USE','PAYMENT_PENDING'].includes(String(data.trolleys.find((item:any)=>String(item.trolleyId||item.id)===trolleyDialog.trolleyId)?.status)))&&' Its active session and any unpaid order will be cancelled.'}
                </div>
                <label className="block space-y-1.5 text-sm font-semibold text-slate-700">
                  {trolleyDialog.status==='DAMAGED'?'Damage reason':'Release / repair reason'}
                  <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" required={trolleyDialog.status==='DAMAGED'} maxLength={200} value={trolleyDialog.reason||''} onChange={(event)=>setTrolleyDialog({...trolleyDialog,reason:event.target.value})} placeholder="For example: customer left trolley" />
                </label>
              </div>
            )}

            {trolleyActionError&&<p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800" role="alert">{trolleyActionError}</p>}
            <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
              <button className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" type="button" disabled={trolleyBusy} onClick={()=>setTrolleyDialog(null)}>Cancel</button>
              <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-teal-800 disabled:opacity-55" type="submit" disabled={trolleyBusy}>
                {trolleyBusy&&<span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
                {trolleyBusy?'Saving…':trolleyDialog.mode==='create'?'Add Trolley':trolleyDialog.status==='DAMAGED'?'Confirm Damaged':trolleyDialog.status==='AVAILABLE'?'Set Available':'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Recent orders
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Payments must be
              confirmed before
              dispatch.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3 font-bold">Order</th>
                <th className="px-3 py-3 font-bold">Trolley</th>
                <th className="px-3 py-3 font-bold">Total</th>
                <th className="px-3 py-3 font-bold">Method</th>
                <th className="px-3 py-3 font-bold">Payment</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-3 py-3 font-bold" />
              </tr>
            </thead>

            <tbody>
              {loading ? (
                [0, 1, 2].map((item) => (
                  <tr className="border-b border-slate-100" key={item}>
                    {[0, 1, 2, 3, 4, 5, 6].map((cell) => (
                      <td className="px-3 py-4" key={cell}>
                        <div className="skeleton-shimmer h-4 w-20 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.orders.map(
                (order) => (
                  <tr
                    className="border-b border-slate-100 text-slate-700 last:border-0"
                    key={
                      order.orderId
                    }
                  >
                    <td className="px-3 py-3">
                      <b>
                        {
                          order.orderId
                        }
                      </b>
                    </td>

                    <td className="px-3 py-3">
                      {
                        order.trolleyId
                      }
                    </td>

                    <td className="px-3 py-3">
                      {money(
                        order.total,
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {
                        order.paymentMethod
                      }
                    </td>

                    <td className="px-3 py-3">
                      {
                        order.paymentStatus
                      }
                    </td>

                    <td className="px-3 py-3">
                      {
                        order.orderStatus
                      }
                    </td>

                    <td className="px-3 py-3">
                      {order.paymentStatus !==
                      'PAID' ? (
                        <button
                          className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-teal-800 disabled:opacity-55"
                          disabled={
                            busy
                          }
                          onClick={() =>
                            confirmPayment(
                              order.orderId,
                            )
                          }
                        >
                          {pendingOrderId === order.orderId && (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                          )}
                          {pendingOrderId === order.orderId ? 'Confirming…' : 'Confirm Pay'}
                        </button>
                      ) : (
                        <span className="whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                          Paid ✓
                        </span>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}