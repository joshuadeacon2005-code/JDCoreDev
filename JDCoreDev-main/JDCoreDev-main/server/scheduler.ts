import { storage } from "./storage";
import { sendEmail, formatMeetingReminderEmail, formatOfficeDayReminderEmail, sendInvoiceReminderEmail, sendMilestoneReminderEmail, isResendConfigured } from "./email";
import { format } from "date-fns";

let schedulerInterval: NodeJS.Timeout | null = null;
let autoDetectInterval: NodeJS.Timeout | null = null;
let lastDigestDate: string | null = null;

export function startReminderScheduler() {
  if (schedulerInterval) {
    console.log("[Scheduler] Already running");
    return;
  }

  console.log("[Scheduler] Starting reminder scheduler (runs every minute)");
  
  schedulerInterval = setInterval(async () => {
    await processReminders();
    await processInvoiceReminders();
    await processMilestoneReminders();
    await checkDailyDigest();
  }, 60 * 1000);

  processReminders();
  setTimeout(() => {
    processInvoiceReminders();
    processMilestoneReminders();
  }, 5000);

  console.log("[Scheduler] Starting auto-detection scheduler (runs every 6 hours)");
  autoDetectInterval = setInterval(async () => {
    await processAutoDetection();
  }, 6 * 60 * 60 * 1000);

  setTimeout(() => {
    processAutoDetection();
  }, 30000);
}

export function stopReminderScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  if (autoDetectInterval) {
    clearInterval(autoDetectInterval);
    autoDetectInterval = null;
  }
  console.log("[Scheduler] Stopped");
}

async function checkDailyDigest() {
  try {
    const now = new Date();
    const hour = now.getHours();
    const todayStr = now.toISOString().slice(0, 10);

    // Daily task digest email disabled
    // if (hour === 7 && lastDigestDate !== todayStr) {
    //   lastDigestDate = todayStr;
    //   console.log("[Scheduler] Triggering daily task digest email");
    //   const adminEmail = process.env.ADMIN_EMAIL || "admin@jdcoredev.com";
    //   const { generateAndSendDigest } = await import("./services/task-digest");
    //   const result = await generateAndSendDigest(adminEmail);
    //   if (result.success) {
    //     console.log("[Scheduler] Daily digest sent successfully");
    //   } else {
    //     console.log(`[Scheduler] Daily digest skipped/failed: ${result.error}`);
    //   }
    // }
  } catch (error: any) {
    console.error("[Scheduler] Error in checkDailyDigest:", error.message);
  }
}

async function processReminders() {
  try {
    const now = new Date();
    const pendingReminders = await storage.getPendingReminders(now);

    if (pendingReminders.length === 0) {
      return;
    }

    console.log(`[Scheduler] Processing ${pendingReminders.length} pending reminders`);

    for (const reminder of pendingReminders) {
      try {
        await processReminder(reminder);
      } catch (error: any) {
        console.error(`[Scheduler] Error processing reminder ${reminder.id}:`, error.message);
        await storage.updateReminder(reminder.id, {
          status: "failed",
          lastError: error.message,
          retryCount: (reminder.retryCount || 0) + 1,
        });
      }
    }
  } catch (error: any) {
    console.error("[Scheduler] Error in processReminders:", error.message);
  }
}

async function processReminder(reminder: {
  id: number;
  reminderType: string;
  entityId: number;
  recipientType: string;
  recipientEmail: string;
  channel: string;
  retryCount: number;
}) {
  if (reminder.retryCount >= 3) {
    console.log(`[Scheduler] Reminder ${reminder.id} exceeded max retries, marking as failed`);
    await storage.updateReminder(reminder.id, {
      status: "failed",
      lastError: "Max retries exceeded",
    });
    return;
  }

  if (reminder.channel === "email") {
    let emailContent;

    if (reminder.reminderType === "meeting") {
      const meeting = await storage.getMeetingRequest(reminder.entityId);
      if (!meeting || meeting.status !== "confirmed") {
        await storage.updateReminder(reminder.id, { status: "cancelled" });
        return;
      }

      emailContent = formatMeetingReminderEmail({
        recipientName: reminder.recipientType === "admin" ? "Admin" : meeting.name,
        meetingDate: meeting.requestedDate,
        meetingTime: meeting.requestedTime,
        meetingType: meeting.meetingType,
        duration: meeting.duration,
        isAdmin: reminder.recipientType === "admin",
        clientName: meeting.name,
      });
      emailContent.to = reminder.recipientEmail;
    } else if (reminder.reminderType === "office_day") {
      const officeDay = await storage.getOfficeDayRequestById(reminder.entityId);
      if (!officeDay || officeDay.status !== "approved") {
        await storage.updateReminder(reminder.id, { status: "cancelled" });
        return;
      }

      const client = await storage.getClient(officeDay.clientId);
      const project = await storage.getProject(officeDay.projectId);

      emailContent = formatOfficeDayReminderEmail({
        recipientName: reminder.recipientType === "admin" ? "Admin" : (client?.name || "Client"),
        officeDayDate: officeDay.date,
        dayType: officeDay.dayType,
        projectName: project?.name,
        isAdmin: reminder.recipientType === "admin",
        clientName: client?.name,
      });
      emailContent.to = reminder.recipientEmail;
    } else {
      throw new Error(`Unknown reminder type: ${reminder.reminderType}`);
    }

    const result = await sendEmail(emailContent);
    
    if (result.success) {
      await storage.updateReminder(reminder.id, {
        status: "sent",
        sentAt: new Date(),
      });
      console.log(`[Scheduler] Reminder ${reminder.id} sent successfully`);
    } else {
      throw new Error(result.error || "Email send failed");
    }
  } else if (reminder.channel === "whatsapp") {
    console.log(`[Scheduler] WhatsApp reminders not implemented yet, skipping reminder ${reminder.id}`);
    await storage.updateReminder(reminder.id, {
      status: "failed",
      lastError: "WhatsApp not implemented",
    });
  }
}

function getReminderScheduledDate(dueDate: Date, reminderNum: number): Date {
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  switch (reminderNum) {
    case 1: return new Date(d.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days before
    case 2: return new Date(d.getTime()); // on due date
    case 3: return new Date(d.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days after
    case 4: return new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days after
    case 5: return new Date(d.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days after
    default: return d;
  }
}

// Process invoice reminders - runs daily to send payment reminders
async function processInvoiceReminders() {
  try {
    // Check if Resend is configured
    const resendAvailable = await isResendConfigured();
    if (!resendAvailable) {
      // Only log once per hour to avoid spam
      return;
    }

    const unpaidInvoices = await storage.getUnpaidHostingInvoicesForReminders();
    
    if (unpaidInvoices.length === 0) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const invoice of unpaidInvoices) {
      try {
        const dueDate = new Date(invoice.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        
        const isOverdue = today > dueDate;
        const daysSinceDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Reminder logic:
        // - First reminder: 3 days before due date
        // - Second reminder: on due date
        // - Third reminder: 3 days after due date (overdue)
        // - Fourth reminder: 7 days after due date (overdue)
        // - Fifth reminder: 14 days after due date (overdue)
        // Max 5 reminders total
        const currentReminderCount = invoice.reminderCount || 0;
        const lastReminderSent = invoice.lastReminderSent ? new Date(invoice.lastReminderSent) : null;
        
        // Don't send more than 5 reminders
        if (currentReminderCount >= 5) {
          continue;
        }
        
        // Prevent sending multiple reminders on the same day
        if (lastReminderSent) {
          lastReminderSent.setHours(0, 0, 0, 0);
          if (lastReminderSent.getTime() === today.getTime()) {
            continue;
          }
        }
        
        // Check for cancelled reminders - skip individually cancelled ones but advance counter
        const cancelledReminders = invoice.cancelledReminders || [];
        const nextReminderNum = currentReminderCount + 1;
        
        // Skip if this reminder has been individually cancelled
        if (cancelledReminders.includes(nextReminderNum)) {
          console.log(`[Scheduler] Reminder ${nextReminderNum} cancelled for invoice ${invoice.invoiceNumber}, advancing counter`);
          // Advance past cancelled reminder so future reminders can proceed
          await storage.updateHostingInvoice(invoice.id, {
            reminderCount: nextReminderNum,
            lastReminderSent: today,
          });
          continue;
        }
        
        // Skip reminders whose scheduled date is before the invoice was issued
        const issueDate = new Date(invoice.invoiceDate);
        issueDate.setHours(0, 0, 0, 0);
        const reminderScheduledDate = getReminderScheduledDate(dueDate, nextReminderNum);
        if (reminderScheduledDate < issueDate) {
          console.log(`[Scheduler] Reminder ${nextReminderNum} for invoice ${invoice.invoiceNumber} was scheduled before issue date, skipping`);
          await storage.updateHostingInvoice(invoice.id, {
            reminderCount: nextReminderNum,
            lastReminderSent: today,
          });
          continue;
        }
        
        // Determine if we should send a reminder based on schedule
        let shouldSendReminder = false;
        
        if (currentReminderCount === 0) {
          // First reminder: 3 days before due OR if already past due
          const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          shouldSendReminder = daysUntilDue <= 3;
        } else if (currentReminderCount === 1) {
          // Second reminder: on due date or after
          shouldSendReminder = daysSinceDue >= 0;
        } else if (currentReminderCount === 2) {
          // Third reminder: 3 days overdue
          shouldSendReminder = daysSinceDue >= 3;
        } else if (currentReminderCount === 3) {
          // Fourth reminder: 7 days overdue
          shouldSendReminder = daysSinceDue >= 7;
        } else if (currentReminderCount === 4) {
          // Fifth reminder: 14 days overdue
          shouldSendReminder = daysSinceDue >= 14;
        }
        
        if (!shouldSendReminder) {
          continue;
        }
        
        const clientEmail = invoice.client.accountsDeptEmail || invoice.client.email;
        const clientName = invoice.client.accountsDeptName || invoice.client.name;
        if (!clientEmail) {
          console.log(`[Scheduler] Skipping invoice ${invoice.invoiceNumber} - no client email`);
          continue;
        }
        
        const result = await sendInvoiceReminderEmail(
          clientEmail,
          clientName,
          invoice.invoiceNumber,
          invoice.totalAmountCents,
          invoice.dueDate,
          isOverdue,
          currentReminderCount + 1
        );
        
        if (result.success) {
          // Update invoice with reminder info
          await storage.updateHostingInvoice(invoice.id, {
            reminderCount: currentReminderCount + 1,
            lastReminderSent: new Date(),
            // Update status to overdue if past due date
            ...(isOverdue && invoice.status === "pending" ? { status: "overdue" } : {})
          });
          console.log(`[Scheduler] Invoice reminder ${currentReminderCount + 1} sent for ${invoice.invoiceNumber} to ${clientEmail}`);
        } else {
          console.error(`[Scheduler] Failed to send invoice reminder for ${invoice.invoiceNumber}:`, result.error);
        }
      } catch (error: any) {
        console.error(`[Scheduler] Error processing invoice ${invoice.id}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error("[Scheduler] Error in processInvoiceReminders:", error.message);
  }
}

// Process milestone reminders - uses same schedule as invoice reminders
async function processMilestoneReminders() {
  try {
    // Check if Resend is configured
    const resendAvailable = await isResendConfigured();
    if (!resendAvailable) {
      return;
    }

    const unpaidMilestones = await storage.getUnpaidMilestonesForReminders();
    
    if (unpaidMilestones.length === 0) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const milestone of unpaidMilestones) {
      try {
        if (!milestone.dueDate) {
          continue;
        }
        
        const dueDate = new Date(milestone.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        
        const isOverdue = today > dueDate;
        const daysSinceDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Same reminder schedule as invoices:
        // - First reminder: 3 days before due date
        // - Second reminder: on due date
        // - Third reminder: 3 days after due date (overdue)
        // - Fourth reminder: 7 days after due date (overdue)
        // - Fifth reminder: 14 days after due date (overdue)
        const currentReminderCount = milestone.reminderCount || 0;
        const lastReminderSent = milestone.lastReminderSent ? new Date(milestone.lastReminderSent) : null;
        
        // Don't send more than 5 reminders
        if (currentReminderCount >= 5) {
          continue;
        }
        
        // Prevent sending multiple reminders on the same day
        if (lastReminderSent) {
          lastReminderSent.setHours(0, 0, 0, 0);
          if (lastReminderSent.getTime() === today.getTime()) {
            continue;
          }
        }
        
        // Determine if we should send a reminder based on schedule
        let shouldSendReminder = false;
        
        // Check for cancelled reminders - skip individually cancelled ones but advance counter
        const cancelledReminders = milestone.cancelledReminders || [];
        const nextReminderNum = currentReminderCount + 1;
        
        // Skip if this reminder has been individually cancelled
        if (cancelledReminders.includes(nextReminderNum)) {
          console.log(`[Scheduler] Reminder ${nextReminderNum} cancelled for milestone "${milestone.name}", advancing counter`);
          // Advance past cancelled reminder so future reminders can proceed
          await storage.updateMilestone(milestone.id, {
            reminderCount: nextReminderNum,
            lastReminderSent: today,
          });
          continue;
        }
        
        if (currentReminderCount === 0) {
          const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          shouldSendReminder = daysUntilDue <= 3;
        } else if (currentReminderCount === 1) {
          shouldSendReminder = daysSinceDue >= 0;
        } else if (currentReminderCount === 2) {
          shouldSendReminder = daysSinceDue >= 3;
        } else if (currentReminderCount === 3) {
          shouldSendReminder = daysSinceDue >= 7;
        } else if (currentReminderCount === 4) {
          shouldSendReminder = daysSinceDue >= 14;
        }
        
        if (!shouldSendReminder) {
          continue;
        }
        
        const clientEmail = milestone.client.accountsDeptEmail || milestone.client.email;
        const clientName = milestone.client.accountsDeptName || milestone.client.name;
        if (!clientEmail) {
          console.log(`[Scheduler] Skipping milestone ${milestone.id} - no client email`);
          continue;
        }
        
        const result = await sendMilestoneReminderEmail(
          clientEmail,
          clientName,
          milestone.name,
          milestone.project.name,
          milestone.amountCents,
          milestone.dueDate,
          isOverdue,
          currentReminderCount + 1
        );
        
        if (result.success) {
          // Update milestone with reminder info
          await storage.updateMilestone(milestone.id, {
            reminderCount: currentReminderCount + 1,
            lastReminderSent: new Date(),
            // Update status to overdue if past due date
            ...(isOverdue && milestone.status === "invoiced" ? { status: "overdue" } : {})
          });
          console.log(`[Scheduler] Milestone reminder ${currentReminderCount + 1} sent for "${milestone.name}" to ${clientEmail}`);
        } else {
          console.error(`[Scheduler] Failed to send milestone reminder for "${milestone.name}":`, result.error);
        }
      } catch (error: any) {
        console.error(`[Scheduler] Error processing milestone ${milestone.id}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error("[Scheduler] Error in processMilestoneReminders:", error.message);
  }
}

async function processAutoDetection() {
  try {
    const allProjects = await storage.getProjects();
    const activeProjects = allProjects.filter(p => p.status === "active" || p.status === "lead");

    if (activeProjects.length === 0) {
      return;
    }

    console.log(`[Scheduler] Running auto-detection for ${activeProjects.length} active projects`);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString().split("T")[0];
    const endDate = new Date().toISOString().split("T")[0];

    for (const project of activeProjects) {
      try {
        const tasks = await storage.getProcessStepsByProject(project.id);
        const nonDoneTasks = tasks.filter(t => t.status !== "done");

        if (nonDoneTasks.length === 0) {
          continue;
        }

        const logs = await storage.getMaintenanceLogsByDateRange(project.id, startDate, endDate);
        const historyEvents = await storage.getHistoryEventsByProject(project.id);
        const recentHistory = historyEvents.filter(e => {
          const eventDate = new Date(e.occurredAt);
          return eventDate >= sevenDaysAgo;
        });

        if (logs.length === 0 && recentHistory.length === 0) {
          continue;
        }

        const taskInputs = nonDoneTasks.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          completionPercentage: t.completionPercentage,
        }));

        const logInputs = logs.map(l => ({
          summary: l.description,
          details: l.category || null,
          occurredAt: l.logDate,
        }));

        const historyInputs = recentHistory.map(h => ({
          summary: h.summary,
          details: h.details || null,
          occurredAt: h.occurredAt,
        }));

        const { detectTaskCompletion } = await import("./services/ai-tasks");
        const results = await detectTaskCompletion(taskInputs, logInputs, historyInputs);

        for (const result of results) {
          const task = nonDoneTasks.find(t => t.id === result.taskId);
          if (!task) continue;

          if (task.status === "done") continue;

          await storage.updateProcessStep(result.taskId, {
            status: result.status as "planned" | "in_progress" | "done",
            completionPercentage: result.completionPercentage,
            autoDetectedStatus: result.reasoning,
            lastAutoChecked: new Date(),
          });

          console.log(`[Scheduler] Auto-detected task ${result.taskId} "${task.title}" → ${result.status} (${result.completionPercentage}%)`);
        }

        for (const task of nonDoneTasks) {
          if (!results.find(r => r.taskId === task.id)) {
            await storage.updateProcessStep(task.id, {
              lastAutoChecked: new Date(),
            });
          }
        }
      } catch (error: any) {
        console.error(`[Scheduler] Error auto-detecting for project ${project.id}:`, error.message);
      }
    }

    console.log("[Scheduler] Auto-detection complete");
  } catch (error: any) {
    console.error("[Scheduler] Error in processAutoDetection:", error.message);
  }
}

export async function scheduleRemindersForOfficeDay(
  officeDayId: number,
  clientEmail: string,
  officeDayDate: Date
) {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@jdcoredev.com";
  const offsets = [24 * 60, 60];

  for (const offsetMinutes of offsets) {
    const sendAt = new Date(officeDayDate.getTime() - offsetMinutes * 60 * 1000);

    if (sendAt > new Date()) {
      const adminKey = `office_day:${officeDayId}:admin:email:${offsetMinutes}`;
      const existingAdmin = await storage.getReminderByIdempotencyKey(adminKey);
      if (!existingAdmin) {
        await storage.createReminder({
          reminderType: "office_day",
          entityId: officeDayId,
          recipientType: "admin",
          recipientEmail: adminEmail,
          channel: "email",
          sendAt,
          status: "pending",
          idempotencyKey: adminKey,
        });
      }

      const clientKey = `office_day:${officeDayId}:client:email:${offsetMinutes}`;
      const existingClient = await storage.getReminderByIdempotencyKey(clientKey);
      if (!existingClient) {
        await storage.createReminder({
          reminderType: "office_day",
          entityId: officeDayId,
          recipientType: "client",
          recipientEmail: clientEmail,
          channel: "email",
          sendAt,
          status: "pending",
          idempotencyKey: clientKey,
        });
      }
    }
  }
}
