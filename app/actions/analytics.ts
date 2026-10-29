"use server";

import { getFileCategory } from "@/lib/file-storage";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import type {
  AnalyticsBucket,
  DashboardAnalytics,
  MonthlyUploadPoint,
} from "@/types/analytics";

function categoryLabel(category: string): string {
  if (category === "documents") return "Documents";
  if (category === "images") return "Images";
  if (category === "videos") return "Videos";
  if (category === "audio") return "Audio";
  return "Other";
}

export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const user = await requireUser();
  const activeFileWhere = { userId: user.id, deletedAt: null };
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setUTCDate(1);
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5);
  sixMonthsAgo.setUTCHours(0, 0, 0, 0);

  const [
    aggregate,
    fileTypes,
    recentUploads,
    recentSummaries,
    totalSearches,
    recentSearches,
    topQueries,
    totalFolders,
    rootFolders,
    trashedFolders,
    monthlyRows,
  ] = await Promise.all([
    prisma.file.aggregate({
      where: activeFileWhere,
      _sum: { size: true },
    }),
    prisma.file.groupBy({
      by: ["extension"],
      where: activeFileWhere,
      _count: { _all: true },
      _sum: { size: true },
    }),
    prisma.file.findMany({
      where: activeFileWhere,
      select: {
        id: true,
        originalName: true,
        extension: true,
        size: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
    }),
    prisma.documentSummary.findMany({
      where: { userId: user.id, file: { deletedAt: null } },
      select: {
        fileId: true,
        executiveSummary: true,
        updatedAt: true,
        file: { select: { originalName: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 5,
    }),
    prisma.searchEvent.count({ where: { userId: user.id } }),
    prisma.searchEvent.count({
      where: { userId: user.id, createdAt: { gte: last30Days } },
    }),
    prisma.searchEvent.groupBy({
      by: ["query"],
      where: { userId: user.id, createdAt: { gte: last30Days } },
      _count: { query: true },
      orderBy: { _count: { query: "desc" } },
      take: 5,
    }),
    prisma.folder.count({ where: { userId: user.id, deletedAt: null } }),
    prisma.folder.count({
      where: { userId: user.id, deletedAt: null, parentFolderId: null },
    }),
    prisma.folder.count({ where: { userId: user.id, deletedAt: { not: null } } }),
    prisma.$queryRaw<Array<{ month: string; bytes: string; count: number }>>`
      SELECT
        to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
        COALESCE(SUM("size"), 0)::text AS bytes,
        COUNT(*)::int AS count
      FROM "File"
      WHERE "userId" = ${user.id}
        AND "deletedAt" IS NULL
        AND "createdAt" >= ${sixMonthsAgo}
      GROUP BY date_trunc('month', "createdAt")
      ORDER BY date_trunc('month', "createdAt") ASC
    `,
  ]);

  const categoryTotals = new Map<string, { bytes: bigint; count: number }>();
  for (const item of fileTypes) {
    const category = getFileCategory(item.extension);
    const current = categoryTotals.get(category) ?? {
      bytes: BigInt(0),
      count: 0,
    };
    current.bytes += item._sum.size ?? BigInt(0);
    current.count += item._count._all;
    categoryTotals.set(category, current);
  }

  const byCategory: AnalyticsBucket[] = [
    "documents",
    "images",
    "videos",
    "audio",
    "other",
  ].map((category) => {
    const value = categoryTotals.get(category) ?? {
      bytes: BigInt(0),
      count: 0,
    };
    return {
      label: categoryLabel(category),
      bytes: value.bytes.toString(),
      count: value.count,
    };
  });

  const fileTypeBuckets: AnalyticsBucket[] = [...fileTypes]
    .sort((left, right) => right._count._all - left._count._all)
    .slice(0, 12)
    .map((item) => ({
      label: item.extension.toUpperCase(),
      bytes: (item._sum.size ?? BigInt(0)).toString(),
      count: item._count._all,
    }));

  const monthlyMap = new Map(monthlyRows.map((row) => [row.month, row]));
  const monthly: MonthlyUploadPoint[] = [];
  for (let offset = 0; offset < 6; offset += 1) {
    const date = new Date(sixMonthsAgo);
    date.setUTCMonth(date.getUTCMonth() + offset);
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = monthlyMap.get(month);
    monthly.push({
      month,
      label: new Intl.DateTimeFormat("en", { month: "short" }).format(date),
      bytes: row?.bytes ?? "0",
      count: row?.count ?? 0,
    });
  }

  return {
    storage: {
      totalBytes: (aggregate._sum.size ?? BigInt(0)).toString(),
      byCategory,
      monthly,
    },
    fileTypes: fileTypeBuckets,
    folderStats: {
      total: totalFolders,
      root: rootFolders,
      trashed: trashedFolders,
    },
    recentUploads: recentUploads.map((file) => ({
      id: file.id,
      originalName: file.originalName,
      extension: file.extension,
      size: file.size.toString(),
      createdAt: file.createdAt.toISOString(),
    })),
    recentSummaries: recentSummaries.map((summary) => ({
      fileId: summary.fileId,
      fileName: summary.file.originalName,
      executiveSummary: summary.executiveSummary,
      updatedAt: summary.updatedAt.toISOString(),
    })),
    searchStats: {
      total: totalSearches,
      last30Days: recentSearches,
      topQueries: topQueries.map((item) => ({
        query: item.query,
        count: item._count.query,
      })),
    },
  };
}
