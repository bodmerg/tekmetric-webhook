import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

if (!DISCORD_WEBHOOK_URL) {
  console.error('❌ DISCORD_WEBHOOK_URL not set');
  process.exit(1);
}

function toUSD(value) {
  return `$${(value / 100).toFixed(2)}`;
}

async function sendDiscordEmbed({ title, description = '', fields = [], color = 0x2f3136 }) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title,
            description,
            color,
            fields
          }
        ]
      })
    });
  } catch (err) {
    console.error('❌ Discord send error:', err.message);
  }
}

app.post('/webhook', async (req, res) => {
  const { event, data } = req.body;

  console.log('📩 Event received:', event);

  try {
    const roNumber = data.repairOrderNumber || data.repairOrderId || data.id;
    let embedPayload = null;

    if (event.includes('Inspection marked complete')) {
      embedPayload = {
        title: '🔍 Inspection Completed',
        description: `**${data.name}** for RO #${roNumber} has been completed.`,
        color: 0x1abc9c
      };

    } else if (event.includes('Repair Order') && event.includes('completed')) {
      embedPayload = {
        title: '✅ Work Completed',
        description: `RO #${roNumber} has been marked as completed.`,
        color: 0x57f287,
        fields: [
          { name: 'Labor', value: toUSD(data.laborSales || 0), inline: true },
          { name: 'Parts', value: toUSD(data.partsSales || 0), inline: true },
          { name: 'Fees', value: toUSD(data.feeTotal || 0), inline: true },
          { name: 'Total', value: `**${toUSD(data.totalSales || 0)}**`, inline: true }
        ]
      };

    } else if (event.includes('Payment made')) {
      embedPayload = {
        title: '💵 Payment Received',
        description: `Payment for RO #${roNumber}`,
        color: 0xfee75c,
        fields: [
          { name: 'Amount', value: toUSD(data.amount || 0), inline: true },
          { name: 'Status', value: data.paymentStatus === 'SUCCEEDED' ? '✅ Paid in full' : '⚠️ Partial', inline: true },
          { name: 'Method', value: data.paymentType?.name || 'Unknown', inline: true }
        ]
      };

    } else if (event.includes('approved') && event.includes('job')) {
      const approved = data.jobs.filter(j => j.authorized).length;
      const declined = data.jobs.length - approved;
      const customer = `${data.customer.firstName} ${data.customer.lastName}`;

      embedPayload = {
        title: '🛠️ Work Authorization',
        description: `Customer **${customer}** responded to jobs for RO #${roNumber}`,
        color: 0x3498db,
        fields: [
          { name: 'Approved Jobs', value: `${approved}`, inline: true },
          { name: 'Declined Jobs', value: `${declined}`, inline: true }
        ]
      };

    } else if (event.includes('viewed estimate')) {
      const customer = `${data.customer.firstName} ${data.customer.lastName}`;
      embedPayload = {
        title: '👀 Estimate Viewed',
        description: `Customer **${customer}** viewed the estimate for RO #${roNumber}`,
        color: 0x5865f2
      };

    } else if (event.includes('Purchase Order') && event.includes('received')) {
      embedPayload = {
        title: '📦 Parts Received',
        description: `Purchase Order #${data.purchaseOrderId} has been marked as received.`,
        color: 0x9b59b6
      };

    } else {
      console.log('⚠️ Unhandled event:', event);
    }

    if (embedPayload) await sendDiscordEmbed(embedPayload);
    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Handler error:', err.message);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook server listening on port ${PORT}`);
});
