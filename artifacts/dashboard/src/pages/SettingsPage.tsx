import { useState, useEffect } from "react";
import {
  useGetBusinessProfile,
  useUpdateBusinessProfile,
  useListStaff,
  useInviteStaff,
  useRemoveStaff,
  getGetBusinessProfileQueryKey,
  getListStaffQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Wifi, WifiOff, Plus, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function ConnectionStatus({ connected, label }: { connected: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {connected ? (
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={cn("text-xs font-medium", connected ? "text-green-700" : "text-muted-foreground")}>
        {connected ? `${label} Connected` : `${label} Not Connected`}
      </span>
    </div>
  );
}

function ProfileSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: profile, isLoading } = useGetBusinessProfile({
    query: { queryKey: getGetBusinessProfileQueryKey() },
  });

  const [form, setForm] = useState({
    name: "",
    whatsappPhoneNumberId: "",
    mpesaShortCode: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name ?? "",
        whatsappPhoneNumberId: profile.whatsappPhoneNumberId ?? "",
        mpesaShortCode: profile.mpesaShortCode ?? "",
      });
    }
  }, [profile]);

  const updateProfile = useUpdateBusinessProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() });
        toast({ title: "Settings saved" });
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    },
  });

  if (isLoading) {
    return <div className="h-32 bg-muted animate-pulse rounded-lg" />;
  }

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-2">
        <CardTitle className="text-sm font-semibold">Business Profile</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {/* Connection status */}
        <div className="flex gap-4 flex-wrap">
          <ConnectionStatus
            connected={profile?.whatsappConnected ?? false}
            label="WhatsApp"
          />
          <ConnectionStatus
            connected={profile?.mpesaConnected ?? false}
            label="Mpesa"
          />
        </div>

        <div className="space-y-3">
          {[
            { key: "name", label: "Business Name", placeholder: "Kamau's Pharmacy" },
            {
              key: "whatsappPhoneNumberId",
              label: "WhatsApp Phone Number ID",
              placeholder: "From Meta Business Dashboard",
            },
            {
              key: "mpesaShortCode",
              label: "Mpesa Short Code",
              placeholder: "174379",
            },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {label}
              </label>
              <input
                data-testid={`input-${key}`}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          ))}
        </div>

        <button
          data-testid="button-save-settings"
          disabled={updateProfile.isPending}
          onClick={() =>
            updateProfile.mutate({
              data: {
                name: form.name || undefined,
                whatsappPhoneNumberId: form.whatsappPhoneNumberId || undefined,
                mpesaShortCode: form.mpesaShortCode || undefined,
              },
            })
          }
          className="bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {updateProfile.isPending ? "Saving..." : "Save Changes"}
        </button>
      </CardContent>
    </Card>
  );
}

function StaffSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("staff");
  const [showForm, setShowForm] = useState(false);

  const { data: staffData, isLoading } = useListStaff({
    query: { queryKey: getListStaffQueryKey() },
  });

  const inviteStaff = useInviteStaff({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });
        setName("");
        setPhone("");
        setShowForm(false);
        toast({ title: "Staff member added" });
      },
      onError: () => toast({ title: "Failed to add staff", variant: "destructive" }),
    },
  });

  const removeStaff = useRemoveStaff({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });
        toast({ title: "Staff member removed" });
      },
    },
  });

  const staff = staffData?.staff ?? [];

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Staff</CardTitle>
        <button
          data-testid="button-add-staff"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Staff
        </button>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {showForm && (
          <div className="space-y-2 p-3 bg-muted rounded-lg">
            <input
              data-testid="input-staff-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              data-testid="input-staff-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (07XX...)"
              className="w-full border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <select
              data-testid="select-staff-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            >
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
            </select>
            <button
              data-testid="button-submit-staff"
              disabled={!name || inviteStaff.isPending}
              onClick={() =>
                inviteStaff.mutate({ data: { name, phone: phone || undefined, role: role as "staff" | "manager" } })
              }
              className="w-full bg-primary text-primary-foreground text-sm font-medium py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-60"
            >
              {inviteStaff.isPending ? "Adding..." : "Add Member"}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff added yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {staff.map((s) => (
              <div
                key={s.id}
                data-testid={`row-staff-${s.id}`}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{s.role}</p>
                </div>
                <button
                  data-testid={`button-remove-staff-${s.id}`}
                  onClick={() => removeStaff.mutate({ id: s.id })}
                  className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold">Settings</h1>
      <ProfileSection />
      <StaffSection />

      <Card>
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-sm font-semibold">WhatsApp Webhook</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Use these URLs in your Meta App configuration:
          </p>
          <div className="space-y-1.5">
            {[
              { label: "Webhook URL", value: `${window.location.origin}/api/webhooks/whatsapp` },
              { label: "Verify Token", value: "duka-verify-token" },
              { label: "Mpesa Callback", value: `${window.location.origin}/api/webhooks/mpesa` },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <code
                  data-testid={`code-${label.toLowerCase().replace(/\s+/g, "-")}`}
                  className="text-xs font-mono bg-muted px-2 py-1 rounded block truncate"
                >
                  {value}
                </code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
