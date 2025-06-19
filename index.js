import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

if (!DISCORD_WEBHOOK_URL) {
  console.error('Error: DISCORD_WEBHOOK_URL environment variable not set');
  process.exit(1);
}

async function sendDiscordMessage(content) {
  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      console.error('Error sending message to Discord:', res.statusText);
    }
  } catch (error) {
    console.error('Error sending message to Discord:', error);
  }
}

app.post('/webhook', async (req, res) => {
  const payload = req.body;
  const event = payload.event || '';
  const data = payload.data || {};

  console.log(`✅ Received webhook event: ${event}`);

  try {
    if (event.includes('Inspection marked complete')) {
      // Simplified inspection confirmation message
      const inspectionName = data.name || 'Inspection';
      const repairOrderNumber = data.repairOrderId || 'Unknown RO';
      const completedDate = data.completedDate
        ? new Date(data.completedDate).toLocaleString()
        : 'Unknown Date';

      const message = `✅ **${inspectionName}** for Repair Order #${repairOrderNumber} has been completed on ${completedDate}.`;

      await sendDiscordMessage(message);
    } else if (event.includes('completed by')) {
      // Work Completed event
      const roNumber = data.repairOrderNumber || (data.id ? `#${data.id}` : 'Unknown RO');
      const customerName = (data.customer && `${data.customer.firstName} ${data.customer.lastName}`) || 'Customer';
      const total = data.totalSales != null ? `$${(data.totalSales / 100).toFixed(2)}` : 'N/A';

      // Build itemized job list if available
      let jobList = '';
      if (data.jobs && Array.isArray(data.jobs)) {
        jobList = data.jobs.map(job => {
          const authorized = job.authorized ? '✅' : '❌';
          const jobTotal = job.subtotal != null ? `$${(job.subtotal / 100).toFixed(2)}` : 'N/A';
          return `• ${job.name} - ${jobTotal} ${authorized}`;
        }).join('\n');
      }

      const message =
        `🛠️ Work Completed for Repair Order #${roNumber}\n` +
        `Customer: **${customerName}**\n` +
        `${jobList ? `\n**Jobs:**\n${jobList}\n` : ''}` +
        `Total: **${total}**`;

      await sendDiscordMessage(message);
    } else if (event.startsWith('Payment made')) {
      // Payment event
      const payer = data.payerName || 'Customer';
      const amount = data.amount != null ? `$${(data.amount / 100).toFixed(2)}` : 'N/A';
      const roNumber = data.repairOrderId || 'Unknown RO';

      const message =
        `💰 Payment received from **${payer}**\n` +
        `Amount: **${amount}**\n` +
        `Applied to Repair Order #${roNumber}`;

      await sendDiscordMessage(message);
    } else if (event.includes('approved') && event.includes('Repair Order')) {
      // Work Authorization event
      const roNumber = data.repairOrderNumber || 'Unknown RO';
      const customerName = data.customer ? `${data.customer.firstName} ${data.customer.lastName}` : 'Customer';
      const jobsApproved = data.jobs ? data.jobs.filter(j => j.authorized).length : 0;
      const jobsDeclined = data.jobs ? data.jobs.filter(j => !j.authorized).length : 0;

      const message =
        `✅ Work Authorization update for Repair Order #${roNumber}\n` +
        `Customer: **${customerName}**\n` +
        `Jobs Approved: **${jobsApproved}**\n` +
        `Jobs Declined: **${jobsDeclined}**`;

      await sendDiscordMessage(message);
    } else if (event.includes('viewed estimate')) {
      // Customer viewed estimate event
      const roNumber = data.repairOrderNumber || 'Unknown RO';
      const customerName = data.customer ? `${data.customer.firstName} ${data.customer.lastName}` : 'Customer';

      const message =
        `👀 Estimate viewed by **${customerName}** for Repair Order #${roNumber}`;

      await sendDiscordMessage(message);
    } else if (event.includes('Purchase Order') && event.includes('received')) {
      // Purchase order received event
      const poNumber = data.purchaseOrderId || 'Unknown PO';

      const message =
        `📦 Purchase Order #${poNumber} has been marked as received.`;

      await sendDiscordMessage(message);
    } else {
      // Ignore or log other events
      console.log(`⚠️ Unhandled event type: ${event}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).send('Server error');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook server listening on port ${PORT}`);
});
