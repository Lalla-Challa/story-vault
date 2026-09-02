import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { logAdminAction as _logAdminAction } from "../services/auditService";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const roleProcedure = (requiredRole: 'super_admin' | 'admin' | 'support' | 'viewer') => 
  t.procedure.use(
    t.middleware(async opts => {
      const { ctx, next } = opts;
      
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      }

      const roleHierarchy: Record<'super_admin' | 'admin' | 'support' | 'viewer' | 'user', number> = {
        'super_admin': 4,
        'admin': 3,
        'support': 2,
        'viewer': 1,
        'user': 0
      };

      const userRole = (ctx.user.role as any) || 'user';
      if (roleHierarchy[userRole as keyof typeof roleHierarchy] < roleHierarchy[requiredRole]) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
      }

      // Automatically wrap in audit for sensitive actions (admin level and above)
      const logAction = async (action: string, entityType?: string, entityId?: number, metadata?: Record<string, unknown>) => {
        if (ctx.user && roleHierarchy[userRole as keyof typeof roleHierarchy] >= roleHierarchy['admin']) {
          await _logAdminAction(ctx.user.id, action, entityType, entityId, metadata);
        }
      };

      return next({
        ctx: {
          ...ctx,
          user: ctx.user,
          logAction,
        },
      });
    })
  );

export const superAdminProcedure = roleProcedure('super_admin');
export const adminProcedure = roleProcedure('admin');
export const supportProcedure = roleProcedure('support');
export const viewerProcedure = roleProcedure('viewer');
