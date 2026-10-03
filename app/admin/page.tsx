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
    <main className="shell">
      <header>
        <div className="headerBrand">
          <img
            className="brandIcon"
            src="/smark-mart-icon.png"
            alt="Smark Mart"
          />

          <div>
            <h1>
              Smark Mart Console
            </h1>

            <p>
              Live store operations
            </p>
          </div>
        </div>

        <nav>
          <a
            className="active"
            href="/admin"
          >
            Admin
          </a>

          <a href="/admin/products">
            Products
          </a>

          <a href="/dispatch">
            Dispatch
          </a>

          <button
            onClick={logout}
          >
            Logout
          </button>
        </nav>
      </header>

      <section className="stats">
        <div>
          <b>
            {stats.available}
          </b>

          <span>
            Available
          </span>
        </div>

        <div>
          <b>{stats.inUse}</b>

          <span>
            In Use
          </span>
        </div>

        <div>
          <b>
            {stats.pending}
          </b>

          <span>
            Payment Pending
          </span>
        </div>

        <div>
          <b>{stats.paid}</b>

          <span>
            Paid / Return
          </span>
        </div>
      </section>

      <section className="panel exportPanel">
        <div className="panelHead">
          <div>
            <h2>
              Export Scan Assets
            </h2>

            <p>
              Download master data,
              QR codes and printable
              CODE128 barcodes.
            </p>
          </div>
        </div>

        <div className="exportGrid">
          <article className="exportCard">
            <div className="exportIcon">
              🛒
            </div>

            <div>
              <h3>
                Trolley Package
              </h3>

              <p>
                Includes trolleys.csv,
                QR images and barcode
                PNG files.
              </p>
            </div>

            <button
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

          <article className="exportCard">
            <div className="exportIcon">
              📦
            </div>

            <div>
              <h3>
                Product Package
              </h3>

              <p>
                Includes products.csv,
                QR images and scannable
                barcode PNG files.
              </p>
            </div>

            <button
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

      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>Trolleys</h2>

            <p>
              Current live status
            </p>
          </div>

          <button onClick={load}>
            Refresh
          </button>
        </div>

        <div className="trolleyGrid">
          {data.trolleys.map(
            (trolley) => (
              <article
                key={
                  trolley.trolleyId ||
                  trolley.id
                }
              >
                <div>
                  <h3>
                    {trolley.trolleyId ||
                      trolley.id}
                  </h3>

                  <p>
                    {trolley.currentSessionId ||
                      'No active session'}
                  </p>
                </div>

                <span
                  className={`badge ${trolley.status}`}
                >
                  {trolley.status}
                </span>
              </article>
            ),
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>
              Recent orders
            </h2>

            <p>
              Payments must be
              confirmed before
              dispatch.
            </p>
          </div>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Trolley</th>
                <th>Total</th>
                <th>Method</th>
                <th>Payment</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {data.orders.map(
                (order) => (
                  <tr
                    key={
                      order.orderId
                    }
                  >
                    <td>
                      <b>
                        {
                          order.orderId
                        }
                      </b>
                    </td>

                    <td>
                      {
                        order.trolleyId
                      }
                    </td>

                    <td>
                      {money(
                        order.total,
                      )}
                    </td>

                    <td>
                      {
                        order.paymentMethod
                      }
                    </td>

                    <td>
                      {
                        order.paymentStatus
                      }
                    </td>

                    <td>
                      {
                        order.orderStatus
                      }
                    </td>

                    <td>
                      {order.paymentStatus !==
                      'PAID' ? (
                        <button
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
                        <span className="good">
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