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
import {
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
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

function SecretField({
  label,
  fieldKey,
  placeholder,
  isSet,
  value,
  onChange,
}: {
  label: string;
  fieldKey: string;
  placeholder: string;
  isSet: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {isSet && !value && (
          <span className="text-xs text-green-600 font-medium">● Set</span>
        )}
      </div>
      <div className="relative">
        <input
          data-testid={`input-${fieldKey}`}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isSet ? "Leave blank to keep existing" : placeholder}
          className="w-full border border-input rounded-md px-3 py-2 text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function ProfileSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [showMpesa, setShowMpesa] = useState(false);

  const { data: profile, isLoading } = useGetBusinessProfile({
    query: { queryKey: getGetBusinessProfileQueryKey() },
  });

  const [form, setForm] = useState({
    name: "",
    currency: "",
    timezone: "",
    ownerPhone: "",
    whatsappPhoneNumberId: "",
    whatsappBusinessAccountId: "",
    whatsappApiToken: "",
    mpesaShortCode: "",
    mpesaPasskey: "",
    mpesaConsumerKey: "",
    mpesaConsumerSecret: "",
  });

  useEffect(() => {
    if (profile) {
      setForm((f) => ({
        ...f,
        name: profile.name ?? "",
        currency: profile.currency ?? "KES",
        timezone: profile.timezone ?? "Africa/Nairobi",
        ownerPhone: profile.ownerPhone ?? "",
        whatsappPhoneNumberId: profile.whatsappPhoneNumberId ?? "",
        whatsappBusinessAccountId: profile.whatsappBusinessAccountId ?? "",
        mpesaShortCode: profile.mpesaShortCode ?? "",
      }));
    }
  }, [profile]);

  const updateProfile = useUpdateBusinessProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() });
        setForm((f) => ({ ...f, whatsappApiToken: "", mpesaPasskey: "", mpesaConsumerKey: "", mpesaConsumerSecret: "" }));
        toast({ title: "Settings saved" });
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    },
  });

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (v: string) => setForm((f) => ({ ...f, [key]: v })),
    };
  }

  function handleSave() {
    const data: Record<string, string | undefined> = {};
    if (form.name) data.name = form.name;
    if (form.currency) data.currency = form.currency;
    if (form.timezone) data.timezone = form.timezone;
    if (form.ownerPhone) data.ownerPhone = form.ownerPhone;
    if (form.whatsappPhoneNumberId) data.whatsappPhoneNumberId = form.whatsappPhoneNumberId;
    if (form.whatsappBusinessAccountId) data.whatsappBusinessAccountId = form.whatsappBusinessAccountId;
    if (form.whatsappApiToken) data.whatsappApiToken = form.whatsappApiToken;
    if (form.mpesaShortCode) data.mpesaShortCode = form.mpesaShortCode;
    if (form.mpesaPasskey) data.mpesaPasskey = form.mpesaPasskey;
    if (form.mpesaConsumerKey) data.mpesaConsumerKey = form.mpesaConsumerKey;
    if (form.mpesaConsumerSecret) data.mpesaConsumerSecret = form.mpesaConsumerSecret;
    updateProfile.mutate({ data });
  }

  if (isLoading) {
    return <div className="h-32 bg-muted animate-pulse rounded-lg" />;
  }

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-2">
        <CardTitle className="text-sm font-semibold">Business Profile</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {/* Connection status row */}
        <div className="flex gap-4 flex-wrap">
          <ConnectionStatus connected={profile?.whatsappConnected ?? false} label="WhatsApp" />
          <ConnectionStatus connected={profile?.mpesaConnected ?? false} label="Mpesa" />
        </div>

        {/* Basic info */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Business Name</label>
            <input
              data-testid="input-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Kamau's Pharmacy"
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Owner WhatsApp Number
              <span className="ml-1 font-normal text-muted-foreground/70">(for low-stock alerts)</span>
            </label>
            <input
              data-testid="input-ownerPhone"
              value={form.ownerPhone}
              onChange={(e) => setForm((f) => ({ ...f, ownerPhone: e.target.value }))}
              placeholder="254712345678"
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Currency</label>
              <input
                data-testid="input-currency"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                placeholder="KES"
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Timezone</label>
              <input
                data-testid="input-timezone"
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                placeholder="Africa/Nairobi"
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>

        {/* WhatsApp credentials — collapsible */}
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowWhatsApp((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors text-sm font-medium"
          >
            <span className="flex items-center gap-2">
              {profile?.whatsappConnected ? (
                <Wifi className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              WhatsApp Credentials
            </span>
            {showWhatsApp ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          {showWhatsApp && (
            <div className="px-3 pb-3 pt-2 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Phone Number ID
                </label>
                <input
                  data-testid="input-whatsappPhoneNumberId"
                  value={form.whatsappPhoneNumberId}
                  onChange={(e) => setForm((f) => ({ ...f, whatsappPhoneNumberId: e.target.value }))}
                  placeholder="From Meta Business Dashboard"
                  className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Business Account ID
                </label>
                <input
                  data-testid="input-whatsappBusinessAccountId"
                  value={form.whatsappBusinessAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, whatsappBusinessAccountId: e.target.value }))}
                  placeholder="WABA ID from Meta"
                  className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <SecretField
                label="API Access Token"
                fieldKey="whatsappApiToken"
                placeholder="EAAxxxxxxxx…"
                isSet={profile?.whatsappApiTokenSet ?? false}
                {...field("whatsappApiToken")}
              />
            </div>
          )}
        </div>

        {/* Mpesa credentials — collapsible */}
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMpesa((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors text-sm font-medium"
          >
            <span className="flex items-center gap-2">
              {profile?.mpesaConnected ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              Mpesa Credentials
            </span>
            {showMpesa ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          {showMpesa && (
            <div className="px-3 pb-3 pt-2 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Short Code (Till/Paybill)</label>
                <input
                  data-testid="input-mpesaShortCode"
                  value={form.mpesaShortCode}
                  onChange={(e) => setForm((f) => ({ ...f, mpesaShortCode: e.target.value }))}
                  placeholder="174379"
                  className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <SecretField
                label="Passkey"
                fieldKey="mpesaPasskey"
                placeholder="bfb279f9aa9bdbcf158e97dd71a46…"
                isSet={profile?.mpesaPasskeySet ?? false}
                {...field("mpesaPasskey")}
              />
              <SecretField
                label="Consumer Key"
                fieldKey="mpesaConsumerKey"
                placeholder="Daraja app consumer key"
                isSet={profile?.mpesaConsumerKeySet ?? false}
                {...field("mpesaConsumerKey")}
              />
              <SecretField
                label="Consumer Secret"
                fieldKey="mpesaConsumerSecret"
                placeholder="Daraja app consumer secret"
                isSet={false}
                {...field("mpesaConsumerSecret")}
              />
            </div>
          )}
        </div>

        <button
          data-testid="button-save-settings"
          disabled={updateProfile.isPending}
          onClick={handleSave}
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
