import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityEventWithUser } from "@shared/schema";

export default function AdminActivity() {
  const { data: events, isLoading } = useQuery<ActivityEventWithUser[]>({
    queryKey: ["/api/admin/activity"],
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Activity</h1>
          <p className="text-muted-foreground">Recent activity across all clients and projects</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Activity Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-6">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ActivityTimeline events={events || []} />
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
