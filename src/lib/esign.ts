// Foxit eSign API Client — server-side only
// Credentials must never leak to the browser.

import type { FXDAField } from '@/types/fxda';

const ESIGN_BASE_URL = 'https://na1.foxitesign.foxit.com/api/';

// --- Types ---

interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface ESignParty {
  firstName: string;
  lastName: string;
  emailId: string;
  permission: string;
  sequence: number;
}

export interface ESignField {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber: number;
  party: number;
  name: string;
  required: boolean;
}

export interface CreateEnvelopeParams {
  folderName: string;
  documentBase64: string;
  fileName: string;
  parties: ESignParty[];
  fields: ESignField[];
  signInSequence: boolean;
  sendNow: boolean;
}

interface EnvelopeResponse {
  folderId: string;
  status: string;
}

interface FolderStatusResponse {
  folderId: string;
  status: string;
  folderName: string;
  parties: ESignParty[];
}

// --- Token cache ---

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

// --- Auth ---

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId = process.env.FOXIT_ESIGN_CLIENT_ID;
  const clientSecret = process.env.FOXIT_ESIGN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing FOXIT_ESIGN_CLIENT_ID or FOXIT_ESIGN_CLIENT_SECRET environment variables',
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'read-write',
  });

  const res = await fetch(`${ESIGN_BASE_URL}oauth2/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eSign auth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as AccessTokenResponse;
  cachedToken = data.access_token;
  // Expire 60s early to avoid edge cases
  tokenExpiresAt = now + data.expires_in * 1000 - 60_000;

  return cachedToken;
}

// --- Envelope operations ---

export async function createEnvelope(
  params: CreateEnvelopeParams,
): Promise<EnvelopeResponse> {
  const token = await getAccessToken();

  const payload = {
    folderName: params.folderName,
    signInSequence: params.signInSequence,
    sendNow: params.sendNow,
    parties: params.parties.map((p) => ({
      firstName: p.firstName,
      lastName: p.lastName,
      emailId: p.emailId,
      permission: p.permission,
      sequence: p.sequence,
    })),
    documents: [
      {
        documentName: params.fileName,
        base64: params.documentBase64,
      },
    ],
    fields: params.fields.map((f) => ({
      type: f.type,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      pageNumber: f.pageNumber,
      partyIndex: f.party,
      name: f.name,
      required: f.required,
    })),
  };

  const res = await fetch(`${ESIGN_BASE_URL}folders/createfolder`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createEnvelope failed (${res.status}): ${text}`);
  }

  return (await res.json()) as EnvelopeResponse;
}

export async function getEnvelopeStatus(
  folderId: string,
): Promise<FolderStatusResponse> {
  const token = await getAccessToken();

  const url = new URL(`${ESIGN_BASE_URL}folders/myfolder`);
  url.searchParams.set('folderId', folderId);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`getEnvelopeStatus failed (${res.status}): ${text}`);
  }

  return (await res.json()) as FolderStatusResponse;
}

export async function downloadSignedDocument(
  folderId: string,
): Promise<Blob> {
  const token = await getAccessToken();

  const url = new URL(`${ESIGN_BASE_URL}folders/download`);
  url.searchParams.set('folderId', folderId);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`downloadSignedDocument failed (${res.status}): ${text}`);
  }

  return res.blob();
}

// --- Field mapping ---
// No translation needed — FXDAField types are eSign-native.
// Direct pass-through to the eSign API format.

export function fxdaFieldsToESign(fields: FXDAField[]): ESignField[] {
  return fields.map((field) => ({
    type: field.type,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    pageNumber: field.page,
    party: field.party ?? 0,
    name: field.name,
    required: field.required,
  }));
}
