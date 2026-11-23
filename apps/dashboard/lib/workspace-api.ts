"use client";

import { createContext, useContext } from "react";
import type { Site } from "@bio-link/schema";
import type { TrafficDay } from "./traffic";
import { siteRequest } from "./siteRequest";

export type SiteSummary = {
  slug: string;
  title: string;
  template: string;
  platform: string | null;
  canEdit: boolean;
  /** Admin hoặc chủ sở hữu: đổi slug, xóa, quản lý thành viên. */
  canManage: boolean;
  publishedSlug: string | null;
};

export type Me = { userId: string; email: string | null; isAdmin: boolean };
export type Role = "editor" | "viewer";
export type Member = { userId: string; email: string; role: Role | "owner" };
export type NewSite = { slug: string; template: string; title?: string; platform?: string };

export type WorkspaceApi = {
  sample: boolean;
  list(signal: AbortSignal): Promise<SiteSummary[]>;
  read(slug: string, published: boolean, signal: AbortSignal): Promise<Site>;
  save(site: Site, publish: boolean): Promise<Site>;
  traffic(slug: string, signal: AbortSignal): Promise<TrafficDay[]>;
  me(signal: AbortSignal): Promise<Me>;
  upload(slug: string, file: File): Promise<{ url: string }>;
  createSite(site: NewSite): Promise<Site>;
  renameSite(slug: string, newSlug: string): Promise<unknown>;
  deleteSite(slug: string): Promise<unknown>;
  members(slug: string, signal: AbortSignal): Promise<Member[]>;
  setMember(slug: string, email: string, role: Role): Promise<Member>;
  removeMember(slug: string, userId: string): Promise<unknown>;
  /** BUILD-3; `null` khi trang chưa có build nào. */
  latestBuild(slug: string, signal: AbortSignal): Promise<Build | null>;
  rebuild(slugs: string[]): Promise<unknown>;
};

export type Build = {
  id: number;
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  liveUpdatedAt: string | null;
  publishedUpdatedAt: string | null;
};

const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const liveApi: WorkspaceApi = {
  sample: false,
  list: (signal) => siteRequest("/api/sites", { signal }),
  read: (slug, published, signal) =>
    siteRequest("/api/sites/" + slug + (published ? "?revision=published" : ""), { signal }),
  save: (site, publish) =>
    siteRequest("/api/sites/" + site.slug, {
      method: publish ? "PUT" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(site),
    }),
  traffic: (slug, signal) => siteRequest("/api/sites/" + slug + "/traffic", { signal }),
  me: (signal) => siteRequest("/api/me", { signal }),
  upload(slug, file) {
    const body = new FormData();
    body.set("file", file);
    return siteRequest("/api/sites/" + slug + "/media", { method: "POST", body });
  },
  createSite: (site) => siteRequest("/api/sites", json("POST", site)),
  renameSite: (slug, newSlug) => siteRequest("/api/sites/" + slug + "/rename", json("POST", { newSlug })),
  deleteSite: (slug) => siteRequest("/api/sites/" + slug, json("DELETE", { confirm: slug })),
  members: (slug, signal) => siteRequest("/api/sites/" + slug + "/members", { signal }),
  setMember: (slug, email, role) => siteRequest("/api/sites/" + slug + "/members", json("PUT", { email, role })),
  removeMember: (slug, userId) =>
    siteRequest("/api/sites/" + slug + "/members/" + encodeURIComponent(userId), { method: "DELETE" }),
  latestBuild: (slug, signal) =>
    siteRequest<Build>("/api/sites/" + slug + "/builds/latest", { signal }).catch((e: Error & { status?: number }) => {
      if (e.status === 404) return null;
      throw e;
    }),
  rebuild: (slugs) => siteRequest("/api/builds", json("POST", { slugs })),
};

export const WorkspaceApiContext = createContext(liveApi);
export const useWorkspaceApi = () => useContext(WorkspaceApiContext);
