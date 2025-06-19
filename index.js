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

async function sendDiscordMessage(content) {
  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      console.error('❌ Discord error:', res.statusText);
    }
  } catch (err) {
    console.error('❌ Discord send error:', err.message);
  }
}

app.post('/webhook', async (req, res) => {
  const { event, data } = req.body;

  console.log('📩 Event received:', event);

  try {
    let message = null;

    if (event.includes('Inspection marked complete')) {
      message = `🛠️ **${data.name}** for RO #${data.repairOrderId} has been marked complete.`;

    } else if (event.includes('Repair Order') && event.includes('completed')) {
      const ro = data.repairOrderNumber || data.id;
      const name = `RO #${ro}`;
      const total = data.totalSales || 0;
      const labor = data.laborSales || 0;
      const parts = data.partsSales || 0;
      const fees = data.feeTotal || 0;
      message = `✅ **${name}** has been completed.\n• Labor: $${labor}\n• Parts: $${parts}\n• Fees: $${fees}\n• **Total: $${total}**`;

    } else if (event.includes('Payment made')) {
      const amount = data.amount || 0;
      const paidInFull = data.paymentStatus === 'SUCCEEDED';
      const ro = data.repairOrderId || 'Unknown';
      message = `💵 Payment of $${amount} received for RO #${ro} (${paidInFull ? 'Paid in full' : 'Partial'}).`;

    } else if (event.includes('approved') && event.includes('job')) {
      const approved = data.jobs.filter(j => j.authorized).length;
      const declined = data.jobs.length - approved;
      const ro = data.repairOrderNumber;
      const customer = `${data.customer.firstName} ${data.customer.lastName}`;
      message = `🛠️ **${customer}** approved **${approved}** job(s) and declined **${declined}** for RO #${ro}.`;

    } else if (event.includes('viewed estimate')) {
      const ro = data.repairOrderNumber;
      const customer = `${data.customer.firstName} ${data.customer.lastName}`;
      message = `👀 **${customer}** viewed the estimate for RO #${ro}.`;

    } else if (event.includes('Purchase Order') && event.includes('received')) {
      const po = data.purchaseOrderId;
      message = `📦 Purchase Order #${po} marked as received.`;

    } else {
      console.log('⚠️ Unhandled event:', event);
    }

    if (message) await sendDiscordMessage(message);
    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Handler error:', err.message);
    res.status(500).send('Internal error');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook server listening on port ${PORT}`);
});
