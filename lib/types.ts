// Shared client/server types.

export type EncBlob = { iv: string; ct: string };
export type WrappedKey = { epk: JsonWebKey; iv: string; ct: string };

export type NoteKind = "text" | "file";
export type FileMeta = { nameEnc: EncBlob; mimeEnc: EncBlob; size: number };

export type SessionUser = { id: string; email: string; name: string };

export type NoteListItem = {
  id: string;
  titleEnc: EncBlob;
  wrap: WrappedKey;
  role: "owner" | "viewer";
  kind?: NoteKind;
  file?: FileMeta | null;
  updatedAt: string;
  grant?: {
    viewsLeft: number | null;
    expiresAt: string | null;
    maxViews: number | null;
  };
};

export type NoteFull = {
  id: string;
  titleEnc: EncBlob;
  bodyEnc: EncBlob;
  selfWrap?: WrappedKey;
  wrap?: WrappedKey;
  role: "owner" | "viewer";
  kind?: NoteKind;
  file?: FileMeta | null;
  createdAt: string;
  updatedAt: string;
  viewsLeft?: number | null;
  viewNumber?: number;
};

export type GrantItem = {
  id: string;
  viewerEmail: string;
  views: number;
  maxViews: number | null;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
};

export type ViewEvent = {
  at: string;
  viewerEmail: string;
  kind: string;
  n: number | null;
  ip: string;
  ua: string;
};
