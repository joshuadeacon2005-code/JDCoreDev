import { useState } from "react";
import ProjectDashboard, { Project, Message } from "@/components/ui/project-management-dashboard";

const initialProjects: Project[] = [
  {
    id: "p1",
    name: "Web Designing",
    subtitle: "Prototyping",
    date: "2025-07-10",
    progress: 60,
    status: "inProgress",
    accentColor: "#f59e0b",
    participants: [
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=64&q=80&auto=format&fit=crop",
    ],
    daysLeft: 2,
    bgColorClass: "bg-amber-50 dark:bg-amber-900/20",
  },
  {
    id: "p2",
    name: "Testing",
    subtitle: "QA Pass",
    date: "2025-06-15",
    progress: 50,
    status: "upcoming",
    accentColor: "#6366f1",
    participants: [
      "https://images.unsplash.com/photo-1596815064285-45ed8a9c0463?w=64&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1583195764036-6dc248ac07d9?w=64&q=80&auto=format&fit=crop",
    ],
    daysLeft: "Due Friday",
    bgColorClass: "bg-indigo-50 dark:bg-indigo-900/20",
  },
  {
    id: "p3",
    name: "Brand Refresh",
    subtitle: "Design System",
    date: "2025-03-02",
    progress: 100,
    status: "completed",
    accentColor: "#10b981",
    participants: [
      "https://images.unsplash.com/photo-1600486913747-55e5470d6f40?w=64&q=80&auto=format&fit=crop",
    ],
    daysLeft: 0,
    bgColorClass: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  {
    id: "p4",
    name: "Mobile App Development",
    subtitle: "React Native",
    date: "2025-08-20",
    progress: 25,
    status: "inProgress",
    accentColor: "#8b5cf6",
    participants: [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&q=80&auto=format&fit=crop",
    ],
    daysLeft: 45,
    bgColorClass: "bg-teal-50 dark:bg-teal-900/20",
  },
  {
    id: "p5",
    name: "API Integration",
    subtitle: "Backend Services",
    date: "2025-05-01",
    progress: 80,
    status: "inProgress",
    accentColor: "#06b6d4",
    participants: [
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=64&q=80&auto=format&fit=crop",
    ],
    daysLeft: 5,
    bgColorClass: "bg-cyan-50 dark:bg-cyan-900/20",
  },
  {
    id: "p6",
    name: "Security Audit",
    subtitle: "Penetration Testing",
    date: "2025-04-15",
    progress: 0,
    status: "paused",
    accentColor: "#ef4444",
    participants: [
      "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=64&q=80&auto=format&fit=crop",
    ],
    daysLeft: "On Hold",
    bgColorClass: "bg-red-50 dark:bg-red-900/20",
  },
];

const demoMessages: Message[] = [
  {
    id: "m1",
    name: "Stephanie",
    avatarUrl:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=96&q=80&auto=format&fit=crop",
    text: "Got your first assignment—looks great. Ready for the next.",
    date: "Aug 20",
    starred: true,
  },
  {
    id: "m2",
    name: "Mark",
    avatarUrl:
      "https://images.unsplash.com/photo-1600486913747-55e5470d6f40?w=96&q=80&auto=format&fit=crop",
    text: "How's the progress? Still waiting on your response.",
    date: "Aug 21",
  },
  {
    id: "m3",
    name: "Sarah",
    avatarUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&q=80&auto=format&fit=crop",
    text: "Can we schedule a call to discuss the new requirements?",
    date: "Aug 22",
  },
];

export default function DemoDashboard() {
  const [data, setData] = useState<Project[]>(initialProjects);

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-900">
      <ProjectDashboard
        title="Project Dashboard Demo"
        user={{ name: "Alex", avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=96&q=80&auto=format&fit=crop" }}
        projects={data}
        messages={demoMessages}
        persistKey="demo-dashboard"
        onProjectUpdate={(proj) => {
          setData((arr) => arr.map((p) => (p.id === proj.id ? proj : p)));
        }}
        onProjectsReorder={(ids) => {
          setData((arr) => {
            const map = new Map(arr.map((p) => [p.id, p]));
            return ids.map((id) => map.get(id)!).filter(Boolean);
          });
        }}
        onProjectCreate={(proj) => {
          setData((arr) => [proj, ...arr]);
        }}
        virtualizeList={false}
        onProjectAction={(id, action) => console.log("Project action:", action, id)}
        onProjectClick={(id) => console.log("Open project:", id)}
        onMessageStarChange={(id, starred) => console.log("Star message:", id, starred)}
      />
    </div>
  );
}
