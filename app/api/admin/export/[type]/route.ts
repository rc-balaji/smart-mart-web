import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';

import { isAdmin } from '../../../../../lib/admin-session';
import { db } from '../../../../../lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AnyObj = Record<string, any>;

function clean(value: any) {
  return String(value ?? '').trim();
}

function safeFileName(value: string) {
  return value
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

function csvEscape(value: any) {
  const text = String(value ?? '');

  if (
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n')
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function makeCsv(
  rows: AnyObj[],
  columns: {
    key: string;
    title: string;
  }[],
) {
  const header = columns
    .map((column) => csvEscape(column.title))
    .join(',');

  const lines = rows.map((row) =>
    columns
      .map((column) => csvEscape(row[column.key]))
      .join(','),
  );

  return [header, ...lines].join('\n');
}

async function makeQr(value: string) {
  return QRCode.toBuffer(value, {
    type: 'png',
    width: 600,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}

async function makeBarcode(value: string) {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: value,
    scale: 4,
    height: 18,
    includetext: true,
    textxalign: 'center',
    backgroundcolor: 'FFFFFF',
    paddingwidth: 14,
    paddingheight: 14,
  });
}

async function exportProducts() {
  const firestore = db();

  const snapshot = await firestore
    .collection('products')
    .orderBy('name')
    .get();

  const products = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as AnyObj[];

  const zip = new JSZip();

  const barcodeFolder = zip.folder('barcodes');
  const qrFolder = zip.folder('qr');

  if (!barcodeFolder || !qrFolder) {
    throw new Error('Failed to create ZIP folders.');
  }

  const csv = makeCsv(products, [
    { key: 'productId', title: 'Product ID' },
    { key: 'category', title: 'Category' },
    { key: 'name', title: 'Product Name' },
    { key: 'pack', title: 'Pack / Quantity' },
    { key: 'unitPrice', title: 'Price' },
    { key: 'stockQty', title: 'Stock Qty' },
    { key: 'reorderLevel', title: 'Reorder Level' },
    { key: 'barcode', title: 'Barcode' },
    { key: 'scanCode', title: 'Scan Code' },
    { key: 'isActive', title: 'Active' },
  ]);

  zip.file('products.csv', csv);

  for (const product of products) {
    const productId =
      clean(product.productId) ||
      clean(product.id);

    const scanValue =
      clean(product.barcode) ||
      clean(product.scanCode) ||
      productId;

    if (!scanValue) {
      continue;
    }

    const filename = safeFileName(productId || scanValue);

    const [barcodePng, qrPng] = await Promise.all([
      makeBarcode(scanValue),
      makeQr(scanValue),
    ]);

    barcodeFolder.file(
      `${filename}.png`,
      barcodePng,
    );

    qrFolder.file(
      `${filename}.png`,
      qrPng,
    );
  }

  zip.file(
    'README.txt',
    [
      'SMARK MART - PRODUCT EXPORT',
      '',
      'products.csv',
      '  Product master data.',
      '',
      'barcodes/',
      '  CODE128 barcode images.',
      '',
      'qr/',
      '  QR images containing the same scan value.',
      '',
      'Scanner matching order:',
      '  barcode -> scanCode -> productId',
      '',
      `Generated: ${new Date().toISOString()}`,
    ].join('\n'),
  );

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  });
}

async function exportTrolleys() {
  const firestore = db();

  const snapshot = await firestore
    .collection('trolleys')
    .get();

  const trolleys = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .sort((a: any, b: any) =>
      String(a.trolleyId || a.id).localeCompare(
        String(b.trolleyId || b.id),
      ),
    ) as AnyObj[];

  const zip = new JSZip();

  const barcodeFolder = zip.folder('barcodes');
  const qrFolder = zip.folder('qr');

  if (!barcodeFolder || !qrFolder) {
    throw new Error('Failed to create ZIP folders.');
  }

  const csv = makeCsv(trolleys, [
    { key: 'trolleyId', title: 'Trolley ID' },
    { key: 'qrPayload', title: 'QR Payload' },
    { key: 'status', title: 'Status' },
    {
      key: 'currentSessionId',
      title: 'Current Session ID',
    },
    {
      key: 'currentUid',
      title: 'Current User UID',
    },
  ]);

  zip.file('trolleys.csv', csv);

  for (const trolley of trolleys) {
    const trolleyId =
      clean(trolley.trolleyId) ||
      clean(trolley.id);

    const scanValue =
      clean(trolley.qrPayload) ||
      trolleyId;

    if (!scanValue) {
      continue;
    }

    const filename = safeFileName(
      trolleyId || scanValue,
    );

    const [barcodePng, qrPng] = await Promise.all([
      makeBarcode(scanValue),
      makeQr(scanValue),
    ]);

    barcodeFolder.file(
      `${filename}.png`,
      barcodePng,
    );

    qrFolder.file(
      `${filename}.png`,
      qrPng,
    );
  }

  zip.file(
    'README.txt',
    [
      'SMARK MART - TROLLEY EXPORT',
      '',
      'trolleys.csv',
      '  Trolley master and current status.',
      '',
      'barcodes/',
      '  CODE128 barcode images.',
      '',
      'qr/',
      '  QR images.',
      '',
      'Recommended:',
      '  Print QR image and fix it permanently on each trolley.',
      '',
      `Generated: ${new Date().toISOString()}`,
    ].join('\n'),
  );

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  });
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      type: string;
    }>;
  },
) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized',
      },
      {
        status: 401,
      },
    );
  }

  try {
    const { type } = await context.params;

    let zipData: Uint8Array;
    let filename: string;

    if (type === 'products') {
      zipData = await exportProducts();
      filename = 'Smark-Mart-Products.zip';
    } else if (type === 'trolleys') {
      zipData = await exportTrolleys();
      filename = 'Smark-Mart-Trolleys.zip';
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid export type.',
        },
        {
          status: 400,
        },
      );
    }

    return new NextResponse(
      Buffer.from(zipData),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition':
            `attachment; filename="${filename}"`,
          'Cache-Control':
            'no-store, max-age=0',
        },
      },
    );
  } catch (error: any) {
    console.error(
      'Export error:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          'Failed to create export.',
      },
      {
        status: 500,
      },
    );
  }
}