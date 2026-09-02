import { useState, useEffect, useRef } from "react";
import {
  Search,
  Trash2,
  UserX,
  UserCheck,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Key,
  MessageSquare,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useLocation } from "wouter";

const PAGE_SIZE = 20;

interface DeleteDialogState {
  open: boolean;
  userId: number | null;
  userEmail: string;
  confirmInput: string;
}

function UserTableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-44" /></TableCell>
          <TableCell><Skeleton className="h-4 w-14" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
          <TableCell><Skeleton className="h-8 w-28" /></TableCell>
          <TableCell><Skeleton className="h-8 w-8" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function UserManagement() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setLocation] = useLocation();
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "user" as "user" | "admin" | "support" | "viewer", isBeta: true });

  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    userId: null,
    userEmail: "",
    confirmInput: "",
  });

  const [passwordDialog, setPasswordDialog] = useState<{ open: boolean; userId: number | null; email: string; newPassword: "" }>({
    open: false,
    userId: null,
    email: "",
    newPassword: "",
  });

  // Debounce search input 300ms
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchInput]);

  const { data, isLoading, isError, refetch } = trpc.admin.users.list.useQuery(
    {
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch || undefined,
    },
    { placeholderData: (prev) => prev }
  );

  const createUserMutation = trpc.adminUser.create.useMutation({
    onSuccess: (data) => {
      toast.success(`User created: ${data.email}. Password: ${data.password}`, {
        duration: 10000,
      });
      setIsAddUserOpen(false);
      setNewUser({ name: "", email: "", role: "user", isBeta: true });
      refetch();
    },
    onError: (err) => {
      toast.error(`Failed to create user: ${err.message}`);
    },
  });

  const suspendMutation = trpc.admin.users.suspend.useMutation({
    onSuccess: () => {
      toast.success("User suspended.");
      refetch();
    },
    onError: (err) => {
      toast.error(`Failed to suspend user: ${err.message}`);
    },
  });

  const unsuspendMutation = trpc.admin.users.unsuspend.useMutation({
    onSuccess: () => {
      toast.success("User unsuspended.");
      refetch();
    },
    onError: (err) => {
      toast.error(`Failed to unsuspend user: ${err.message}`);
    },
  });

  const updateRoleMutation = trpc.adminUser.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("User role updated.");
      refetch();
    },
    onError: (err) => {
      toast.error(`Failed to update role: ${err.message}`);
    },
  });

  const updatePasswordMutation = trpc.adminUser.updateUserPassword.useMutation({
    onSuccess: () => {
      toast.success("User password updated.");
      setPasswordDialog({ open: false, userId: null, email: "", newPassword: "" });
    },
    onError: (err) => {
      toast.error(`Failed to update password: ${err.message}`);
    },
  });

  const deleteMutation = trpc.admin.users.delete.useMutation({
    onSuccess: () => {
      toast.success("User deleted.");
      setDeleteDialog({ open: false, userId: null, userEmail: "", confirmInput: "" });
      refetch();
    },
    onError: (err) => {
      toast.error(`Failed to delete user: ${err.message}`);
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function openDeleteDialog(userId: number, userEmail: string) {
    setDeleteDialog({ open: true, userId, userEmail, confirmInput: "" });
  }

  function handleDeleteConfirm() {
    if (
      deleteDialog.userId !== null &&
      deleteDialog.confirmInput === deleteDialog.userEmail
    ) {
      deleteMutation.mutate({
        userId: deleteDialog.userId,
        confirmEmail: deleteDialog.confirmInput,
      });
    }
  }

  const deleteConfirmEnabled =
    deleteDialog.confirmInput === deleteDialog.userEmail &&
    deleteDialog.userEmail.length > 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">
            User Management
          </h1>
          <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">
            View, manage roles, and reset credentials for user accounts.
          </p>
        </div>
        <div className="flex gap-2">
            <Button onClick={() => setIsAddUserOpen(true)} className="gap-2">
                <Users className="w-4 h-4" /> Add User
            </Button>
            <Button onClick={() => setLocation("/communication")} variant="outline" className="gap-2">
                <MessageSquare className="w-4 h-4" /> Broadcast
            </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7e756f] pointer-events-none" />
        <Input
          className="pl-9 border-[#E5E2DE] bg-white text-[#2D2926] placeholder:text-[#b0a89f] focus-visible:ring-[#D4A373]/40 font-[Inter]"
          placeholder="Search by name or email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search users"
        />
      </div>

      {/* Error state */}
      {isError && (
        <Alert variant="destructive" className="border-[#ffdad6] bg-[#fff8f7]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-[#93000a]">Failed to load users</AlertTitle>
          <AlertDescription className="text-[#93000a]/80">
            <span>Could not fetch user list.</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="mt-2 border-[#93000a]/30 text-[#93000a] hover:bg-[#ffdad6]/40"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Table */}
      <div className="rounded-lg border border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)] overflow-hidden">
        <Table>
          <TableHeader className="bg-[#FDFCFB]">
            <TableRow className="border-[#E5E2DE]">
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">ID</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Name</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Email</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Role</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Registered</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Manage</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Suspend</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Delete</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <UserTableSkeleton />
            ) : data && data.users.length > 0 ? (
              data.users.map((user) => {
                const isSuspended = !!user.suspendedAt;
                const isSuspending =
                  suspendMutation.isPending &&
                  suspendMutation.variables?.userId === user.id;
                const isUnsuspending =
                  unsuspendMutation.isPending &&
                  unsuspendMutation.variables?.userId === user.id;
                const isDeleting =
                  deleteMutation.isPending &&
                  deleteDialog.userId === user.id;

                return (
                  <TableRow
                    key={user.id}
                    className="border-[#E5E2DE] hover:bg-[#FDFCFB] transition-colors"
                  >
                    <TableCell className="text-[#7e756f] font-[Inter] text-xs">
                      {user.id}
                    </TableCell>
                    <TableCell className="text-[#2D2926] font-[Inter] font-medium">
                      {user.name}
                    </TableCell>
                    <TableCell className="text-[#4d4540] font-[Inter]">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={user.role} 
                        onValueChange={(role: any) => updateRoleMutation.mutate({ userId: user.id, role })}
                        disabled={updateRoleMutation.isPending}
                      >
                        <SelectTrigger className="h-8 w-[100px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="support">Support</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {isSuspended ? (
                        <Badge
                          variant="destructive"
                          className="bg-[#ffdad6] text-[#93000a] border-[#ffdad6] font-[Inter]"
                        >
                          Suspended
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-[#6B705C]/30 text-[#6B705C] font-[Inter]"
                        >
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[#7e756f] font-[Inter] text-xs">
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                        <div className="flex gap-1">
                            <Button size="icon-sm" variant="ghost" onClick={() => setPasswordDialog({ open: true, userId: user.id, email: user.email || "", newPassword: "" })}>
                                <Key className="w-4 h-4" />
                            </Button>
                            <Button size="icon-sm" variant="ghost" onClick={() => setLocation(`/communication?userId=${user.id}`)}>
                                <MessageSquare className="w-4 h-4" />
                            </Button>
                        </div>
                    </TableCell>
                    <TableCell>
                      {isSuspended ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#6B705C]/40 text-[#6B705C] hover:bg-[#6B705C]/10 font-[Inter] gap-1.5"
                          disabled={isUnsuspending}
                          onClick={() =>
                            unsuspendMutation.mutate({ userId: user.id })
                          }
                          aria-label={`Unsuspend ${user.name}`}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          {isUnsuspending ? "Restoring…" : "Unsuspend"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#D4A373]/40 text-[#a07040] hover:bg-[#D4A373]/10 font-[Inter] gap-1.5"
                          disabled={isSuspending}
                          onClick={() =>
                            suspendMutation.mutate({ userId: user.id })
                          }
                          aria-label={`Suspend ${user.name}`}
                        >
                          <UserX className="h-3.5 w-3.5" />
                          {isSuspending ? "Suspending…" : "Suspend"}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-[#93000a]/70 hover:text-[#93000a] hover:bg-[#ffdad6]/40"
                        disabled={isDeleting || !user.email}
                        onClick={() => openDeleteDialog(user.id, user.email ?? "")}
                        aria-label={`Delete ${user.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-12 text-[#7e756f] font-[Inter]"
                >
                  {debouncedSearch
                    ? `No users match "${debouncedSearch}".`
                    : "No users found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!isLoading && data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#7e756f] font-[Inter]">
            Page {page} of {totalPages} &mdash;{" "}
            <span className="text-[#4d4540]">{data.total.toLocaleString()} users</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-[#E5E2DE] text-[#4d4540] hover:bg-[#FDFCFB] font-[Inter]"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-[#E5E2DE] text-[#4d4540] hover:bg-[#FDFCFB] font-[Inter]"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Add User Dialog */}
      <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
        <DialogContent>
            <DialogHeader><DialogTitle>Add New User / Provision Beta</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input 
                        value={newUser.name} 
                        onChange={e => setNewUser({...newUser, name: e.target.value})} 
                        placeholder="John Doe"
                    />
                </div>
                <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input 
                        value={newUser.email} 
                        onChange={e => setNewUser({...newUser, email: e.target.value})} 
                        placeholder="user@example.com"
                    />
                </div>
                <div className="space-y-2">
                    <Label>Assign Role</Label>
                    <Select 
                        value={newUser.role} 
                        onValueChange={(role: any) => setNewUser({...newUser, role})}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="user">User (Standard)</SelectItem>
                            <SelectItem value="admin">Admin (Full Access)</SelectItem>
                            <SelectItem value="support">Support (Operations)</SelectItem>
                            <SelectItem value="viewer">Viewer (Read Only)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center space-x-2 pt-2">
                    <Switch 
                        checked={newUser.isBeta} 
                        onCheckedChange={v => setNewUser({...newUser, isBeta: v})} 
                    />
                    <Label className="text-xs">Provision as Beta Tester (Auto-generated tester login)</Label>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddUserOpen(false)}>Cancel</Button>
                <Button 
                    onClick={() => createUserMutation.mutate(newUser)}
                    disabled={createUserMutation.isPending || !newUser.name || !newUser.email}
                >
                    Create User
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={passwordDialog.open} onOpenChange={(o) => !o && setPasswordDialog({ ...passwordDialog, open: false })}>
        <DialogContent>
            <DialogHeader><DialogTitle>Reset Password for {passwordDialog.email}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>New Password</Label>
                    <Input 
                        type="password" 
                        value={passwordDialog.newPassword} 
                        onChange={e => setPasswordDialog({...passwordDialog, newPassword: e.target.value as any})} 
                        placeholder="Min 8 characters"
                    />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setPasswordDialog({ ...passwordDialog, open: false })}>Cancel</Button>
                <Button 
                    onClick={() => updatePasswordMutation.mutate({ userId: passwordDialog.userId!, newPassword: passwordDialog.newPassword })}
                    disabled={updatePasswordMutation.isPending || passwordDialog.newPassword.length < 8}
                >
                    Reset Password
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation AlertDialog */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialog({ open: false, userId: null, userEmail: "", confirmInput: "" });
          }
        }}
      >
        <AlertDialogContent className="border-[#E5E2DE] bg-[#FDFCFB]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#2D2926] font-[Literata]">
              Delete user account
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#4d4540] font-[Inter] space-y-3">
              <span className="block">
                This will permanently delete the account and all associated data
                (projects, scenes, characters, notes, activity events, and
                sessions). This action cannot be undone.
              </span>
              <span className="block font-medium text-[#2D2926]">
                Type{" "}
                <span className="font-mono bg-[#f0ede9] px-1.5 py-0.5 rounded text-[#93000a] text-xs">
                  {deleteDialog.userEmail}
                </span>{" "}
                to confirm.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="px-0 pb-2">
            <Input
              className="border-[#E5E2DE] bg-white text-[#2D2926] placeholder:text-[#b0a89f] focus-visible:ring-[#D4A373]/40 font-[Inter] font-mono"
              placeholder={deleteDialog.userEmail}
              value={deleteDialog.confirmInput}
              onChange={(e) =>
                setDeleteDialog((prev) => ({
                  ...prev,
                  confirmInput: e.target.value,
                }))
              }
              aria-label="Confirm user email to delete"
              autoComplete="off"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-[#E5E2DE] text-[#4d4540] hover:bg-[#f0ede9] font-[Inter]"
              onClick={() =>
                setDeleteDialog({ open: false, userId: null, userEmail: "", confirmInput: "" })
              }
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#93000a] text-white hover:bg-[#7a0008] font-[Inter] disabled:opacity-40"
              disabled={!deleteConfirmEnabled || deleteMutation.isPending}
              onClick={handleDeleteConfirm}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
