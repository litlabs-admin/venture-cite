import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { MessageSquare, Plus, RefreshCw, History, Bell, Mail, Trash2, Send } from "lucide-react";
import type { AlertSettings, AlertHistory } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AlertsTab({ selectedBrandId }: { selectedBrandId: string }) {
  const { toast } = useToast();

  const { data: alertSettingsData, isLoading: alertsLoading } = useQuery<{
    success: boolean;
    data: AlertSettings[];
  }>({
    queryKey: [`/api/alert-settings/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { data: alertHistoryData } = useQuery<{ success: boolean; data: AlertHistory[] }>({
    queryKey: [`/api/alert-history/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const alertSettings = alertSettingsData?.data || [];
  const alertHistoryList = alertHistoryData?.data || [];

  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
  const [newAlert, setNewAlert] = useState({
    alertType: "hallucination_detected",
    threshold: 10,
    emailEnabled: false,
    emailAddress: "",
    slackEnabled: false,
    slackWebhookUrl: "",
  });

  const createAlertMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/alert-settings", {
        ...data,
        brandId: selectedBrandId,
        emailEnabled: data.emailEnabled ? 1 : 0,
        slackEnabled: data.slackEnabled ? 1 : 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/alert-settings/${selectedBrandId}`] });
      setIsAlertDialogOpen(false);
      toast({ title: "Alert created", description: "You'll be notified when this event occurs" });
    },
  });

  const deleteAlertMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/alert-settings/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/alert-settings/${selectedBrandId}`] });
      toast({ title: "Alert deleted" });
    },
  });

  const testAlertMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/alerts/test/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/alert-history/${selectedBrandId}`] });
      toast({ title: "Test alert sent", description: "Check your configured channels" });
    },
  });

  const alertTypes = [
    {
      value: "hallucination_detected",
      label: "Hallucination Detected",
      description: "When AI makes an inaccurate claim about your brand",
    },
    {
      value: "soa_drop",
      label: "Share-of-Answer Drop",
      description: "When your SOA drops by threshold %",
    },
    {
      value: "soa_increase",
      label: "Share-of-Answer Increase",
      description: "When your SOA increases by threshold %",
    },
    {
      value: "quality_drop",
      label: "Citation Quality Drop",
      description: "When citation quality drops below threshold",
    },
    {
      value: "competitor_surge",
      label: "Competitor Surge",
      description: "When a competitor gains significant visibility",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Alert Notifications</h3>
          <p className="text-sm text-muted-foreground">
            Get notified about important AI intelligence events via Email or Slack
          </p>
        </div>
        <Dialog open={isAlertDialogOpen} onOpenChange={setIsAlertDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-alert">
              <Plus className="w-4 h-4 mr-2" />
              Add Alert
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Alert</DialogTitle>
              <DialogDescription>Configure when and how you want to be notified</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Alert Type</Label>
                <Select
                  value={newAlert.alertType}
                  onValueChange={(v) => setNewAlert({ ...newAlert, alertType: v })}
                >
                  <SelectTrigger data-testid="select-alert-type">
                    <SelectValue placeholder="Select alert type" />
                  </SelectTrigger>
                  <SelectContent>
                    {alertTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {alertTypes.find((t) => t.value === newAlert.alertType)?.description}
                </p>
              </div>

              {newAlert.alertType !== "hallucination_detected" && (
                <div className="space-y-2">
                  <Label>Threshold (%)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[newAlert.threshold]}
                      onValueChange={([v]) => setNewAlert({ ...newAlert, threshold: v })}
                      min={1}
                      max={50}
                      step={1}
                      className="flex-1"
                    />
                    <span className="w-12 text-right font-medium">{newAlert.threshold}%</span>
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-2 border-t">
                <Label>Notification Channels</Label>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">Email</span>
                    </div>
                    <Switch
                      checked={newAlert.emailEnabled}
                      onCheckedChange={(v) => setNewAlert({ ...newAlert, emailEnabled: v })}
                      data-testid="switch-email-enabled"
                    />
                  </div>
                  {newAlert.emailEnabled && (
                    <Input
                      placeholder="your@email.com"
                      value={newAlert.emailAddress}
                      onChange={(e) => setNewAlert({ ...newAlert, emailAddress: e.target.value })}
                      data-testid="input-email-address"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">Slack</span>
                    </div>
                    <Switch
                      checked={newAlert.slackEnabled}
                      onCheckedChange={(v) => setNewAlert({ ...newAlert, slackEnabled: v })}
                      data-testid="switch-slack-enabled"
                    />
                  </div>
                  {newAlert.slackEnabled && (
                    <Input
                      placeholder="https://hooks.slack.com/services/..."
                      value={newAlert.slackWebhookUrl}
                      onChange={(e) =>
                        setNewAlert({ ...newAlert, slackWebhookUrl: e.target.value })
                      }
                      data-testid="input-slack-webhook"
                    />
                  )}
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => createAlertMutation.mutate(newAlert)}
                disabled={
                  createAlertMutation.isPending ||
                  (!newAlert.emailEnabled && !newAlert.slackEnabled)
                }
                data-testid="button-create-alert"
              >
                {createAlertMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Bell className="w-4 h-4 mr-2" />
                )}
                Create Alert
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {alertsLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading alerts...</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Active Alerts
              </CardTitle>
              <CardDescription>
                {alertSettings.length} alert{alertSettings.length !== 1 ? "s" : ""} configured
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alertSettings.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-2">No alerts configured</p>
                  <p className="text-sm text-muted-foreground">
                    Create an alert to get notified about important events
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alertSettings.map((setting) => (
                    <div key={setting.id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">
                          {alertTypes.find((t) => t.value === setting.alertType)?.label ||
                            setting.alertType}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => testAlertMutation.mutate(setting.id)}
                            disabled={testAlertMutation.isPending}
                            data-testid={`button-test-alert-${setting.id}`}
                          >
                            <Send className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteAlertMutation.mutate(setting.id)}
                            disabled={deleteAlertMutation.isPending}
                            data-testid={`button-delete-alert-${setting.id}`}
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {setting.emailEnabled === 1 && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <span>Email</span>
                          </div>
                        )}
                        {setting.slackEnabled === 1 && (
                          <div className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            <span>Slack</span>
                          </div>
                        )}
                        {setting.threshold && <span>| Threshold: {setting.threshold}%</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Alert History
              </CardTitle>
              <CardDescription>Recent notifications sent</CardDescription>
            </CardHeader>
            <CardContent>
              {alertHistoryList.length === 0 ? (
                <div className="text-center py-8">
                  <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-2">No alerts sent yet</p>
                  <p className="text-sm text-muted-foreground">
                    Alerts will appear here when triggered
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {alertHistoryList.map((history) => (
                    <div key={history.id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-xs">
                          {history.alertType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(history.sentAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm">{history.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Sent via: {history.sentVia}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
