import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Helper to format numbers as USD currency
function toUSD(amount) {
  return `$${(amount / 100).toFixed(2)}`; // assumes amount is in cents
}

app.post('/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;

    // Extract repair order number safely
    const roNumber = data.repairOrderNumber || data.repairOrderId || 'Unknown';

    // Get customer name if available
    const customerName =
      data.customer?.firstName && data.customer?.lastName
        ? `${data.customer.firstName} ${data.customer.lastName}`
        : data.payerName || null;

    let embedPayload = null;

    if (event.includes('completed')) {
      // Work Completed event
      const description = customerName
        ? `Repair Order #${roNumber} for customer **${customerName}** has been marked as completed.`
        : `Repair Order #${roNumber} has been marked as completed.`;

      embedPayload = {
        title: '✅ Work Completed',
        description,
        color: 0x2ecc71, // Emerald Green
        fields: [
          { name: 'Labor', value: toUSD(data.laborSales || 0), inline: true },
          { name: 'Parts', value: toUSD(data.partsSales || 0), inline: true },
          { name: 'Fees', value: toUSD(data.feeTotal || 0), inline: true },
          { name: 'Total', value: `**${toUSD(data.totalSales || 0)}**`, inline: true },
        ],
      };
    } else if (event.includes('Payment made')) {
      // Payment event
      const description = customerName
        ? `Payment of **${toUSD(data.amount || 0)}** received from **${customerName}** for Repair Order #${roNumber}.`
        : `Payment of **${toUSD(data.amount || 0)}** received for Repair Order #${roNumber}.`;

      embedPayload = {
        title: '💰 Payment Received',
        description,
        color: 0xf39c12, // Orange
        fields: [
          { name: 'Amount', value: toUSD(data.amount || 0), inline: true },
          { name: 'Payment Type', value: data.paymentType?.name || 'Unknown', inline: true },
          { name: 'Status', value: data.paymentStatus || 'Unknown', inline: true },
        ],
      };
    } else if (event.includes('approved') || event.includes('declined')) {
      // Work Authorization event
      const approvedJobs = data.jobs?.filter((job) => job.authorized).length || 0;
      const declinedJobs = (data.jobs?.length || 0) - approvedJobs;

      const description = customerName
        ? `Customer **${customerName}** responded to jobs for Repair Order #${roNumber}`
        : `Customer responded to jobs for Repair Order #${roNumber}`;

      embedPayload = {
        title: '🛠️ Work Authorization',
        description,
        color: 0x3498db, // Bright Blue
        fields: [
          { name: 'Approved Jobs', value: `${approvedJobs}`, inline: true },
          { name: 'Declined Jobs', value: `${declinedJobs}`, inline: true },
        ],
      };
    } else if (event.includes('viewed estimate')) {
      // Estimate Viewed event
      const description = customerName
        ? `Customer **${customerName}** viewed the estimate for Repair Order #${roNumber}`
        : `An estimate was viewed for Repair Order #${roNumber}`;

      embedPayload = {
        title: '👁️ Estimate Viewed',
        description,
        color: 0x9b59b6, // Amethyst Purple
      };
    } else if (event.includes('Inspection marked complete')) {
      // Inspection completed - simple confirmation message
      embedPayload = {
        title: '🔍 Inspection Completed',
        description: `Inspection for Repair Order #${roNumber} has been marked complete.`,
        color: 0xe67e22, // Carrot Orange
      };
    } else if (event.includes('Purchase Order') && event.includes('received')) {
      // Purchase order received
      embedPayload = {
        title: '📦 Purchase Order Received',
        description: `Purchase Order #${data.purchaseOrderId} has been marked as received.`,
        color: 0x7f8c8d, // Gray
      };
    } else {
      // Unknown event
      embedPayload = {
        title: 'ℹ️ Tekmetric Notification',
        description: event,
        color: 0x95a5a6, // Light Gray-Blue
      };
    }

    // Send the embed to Discord webhook
    if (embedPayload) {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embedPayload] }),
      });
      console.log(`📩 Sent notification for event: ${event}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Error handling webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook server listening on port ${PORT}`);
});
