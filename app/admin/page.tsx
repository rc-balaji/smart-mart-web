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

  const [exporting, setExporting] =
    useState<string>('');

  async function load() {
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

    if (json.ok) {
      setData(json.data);
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

      await load();
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
    });

    router.replace('/');
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

          <a className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" href="/dispatch">
            Dispatch
          </a>

          <button
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={logout}
          >
            Logout
          </button>
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <b className="block text-2xl font-black text-slate-950">
            {stats.available}
          </b>

          <span className="mt-1 block text-sm font-medium text-slate-500">
            Available
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <b className="block text-2xl font-black text-slate-950">{stats.inUse}</b>

          <span className="mt-1 block text-sm font-medium text-slate-500">
            In Use
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <b className="block text-2xl font-black text-slate-950">
            {stats.pending}
          </b>

          <span className="mt-1 block text-sm font-medium text-slate-500">
            Payment Pending
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <b className="block text-2xl font-black text-slate-950">{stats.paid}</b>

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
              className="col-span-2 mt-1 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-55"
              disabled={
                Boolean(exporting)
              }
              onClick={() =>
                downloadExport(
                  'trolleys',
                )
              }
            >
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
              className="col-span-2 mt-1 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-55"
              disabled={
                Boolean(exporting)
              }
              onClick={() =>
                downloadExport(
                  'products',
                )
              }
            >
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

          <button className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800" onClick={load}>
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.trolleys.map(
            (trolley) => (
              <article
                className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                key={
                  trolley.trolleyId ||
                  trolley.id
                }
              >
                <div>
                  <h3 className="truncate font-bold text-slate-900">
                    {trolley.trolleyId ||
                      trolley.id}
                  </h3>

                  <p className="mt-1 truncate text-xs text-slate-500">
                    {trolley.currentSessionId ||
                      'No active session'}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
                    trolley.status === 'AVAILABLE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : trolley.status === 'IN_USE'
                        ? 'bg-blue-100 text-blue-800'
                        : trolley.status === 'PAYMENT_PENDING'
                          ? 'bg-orange-100 text-orange-800'
                          : trolley.status === 'PAID'
                            ? 'bg-violet-100 text-violet-800'
                            : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {trolley.status}
                </span>
              </article>
            ),
          )}
        </div>
      </section>

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
              {data.orders.map(
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
                          className="whitespace-nowrap rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-teal-800 disabled:opacity-55"
                          disabled={
                            busy
                          }
                          onClick={() =>
                            confirmPayment(
                              order.orderId,
                            )
                          }
                        >
                          Confirm Pay
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