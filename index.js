// index.js
const express = require('express');
const axios = require('axios');
const app = express();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!DISCORD_WEBHOOK_URL) {
  console.error('Error: DISCORD_WEBHOOK_URL environment variable not set.');
  process.exit(1);
}

app.use(express.json());

app.post('/tekmetric-webhook', async (req, res) => {
  const payload = req.body;
  const event = payload.event || '';
  const data = payload.data || {};

  let customerName = 'Unknown Customer';
  if (data.customer?.firstName && data.customer?.lastName) {
    customerName = `${data.customer.firstName} ${data.customer.lastName}`;
  } else {
    const match = event.match(/^([A-Z][a-z]+\s[A-Z][a-z]+)\s(viewed|approved|declined|marked|paid)/i);
    if (match && match[1]) {
      customerName = match[1];
    }
  }

  let message = null;

  try {
    // Estimate Viewed
    if (event.toLowerCase().includes('estimate') && event.toLowerCase().includes('viewed')) {
      message = `🧐 **Estimate Viewed**\n${customerName} viewed estimate for RO #${data.repairOrderNumber}`;
    }
    // Work Approved / Declined
    else if (event.toLowerCase().includes('approved') && event.toLowerCase().includes('declined')) {
      const approvedCount = data.jobs?.filter(job => job.authorized === true).length || 0;
      const declinedCount = data.jobs?.filter(job => job.authorized === false).length || 0;
      message = `🔧 **Work Authorization**\n${customerName} approved ${approvedCount} job(s) and declined ${declinedCount} job(s) for RO #${data.repairOrderNumber}`;
    }
    // Repair Order Completed
    else if (data.repairOrderStatus?.name?.toLowerCase() === 'complete' || data.repairOrderStatus?.name?.toLowerCase() === 'completed') {
      message = `🎉 **RO Completed**\nRO #${data.repairOrderNumber} for ${customerName} is marked as completed.`;
    }
    // Inspection Completed
    else if (event.toLowerCase().includes('inspection') && event.toLowerCase().includes('complete')) {
      message = `🔍 **Inspection Complete**\n${data.name || 'Inspection'} completed for RO #${data.repairOrderId || data.repairOrderNumber || 'Unknown'} for ${customerName}`;
    }
    // Part Received
    else if (event.toLowerCase().includes('purchase order') && event.toLowerCase().includes('received')) {
      const poMatch = event.match(/Purchase Order #(\d+)/);
      const poNumber = poMatch ? poMatch[1] : 'Unknown';
      message = `📦 **Part Received**\nPurchase Order #${poNumber} marked as received.`;
    }
    // Payment Made - partial or full
    else if (event.toLowerCase().includes('payment made')) {
      const payer = data.payerName || customerName;
      const amount = data.amount ? (data.amount / 100).toFixed(2) : 'Unknown';
      const paidAmount = data.amountPaid || 0;
      const totalSales = data.totalSales || 0;
      const roNum = data.repairOrderNumber || data.repairOrderId || 'Unknown';

      if (paidAmount > 0 && totalSales > 0) {
        // Partial or full payment based on amountPaid vs totalSales
        if (paidAmount >= totalSales) {
          message = `💳 **Payment Received - Paid in Full**\nRO #${roNum} for ${customerName} has been paid in full.\nTotal: $${(paidAmount / 100).toFixed(2)}`;
        } else {
          message = `💵 **Payment Made (Partial)**\n${payer} paid $${amount} towards RO #${roNum}.`;
        }
      } else {
        // Fallback payment message if amountPaid or totalSales not present
        message = `💵 **Payment Made**\n${payer} paid $${amount} for RO #${roNum}`;
      }
    }

    if (message) {
      await axios.post(DISCORD_WEBHOOK_URL, { content: message });
      res.status(200).send('Notification sent to Discord');
    } else {
      res.status(200).send('No matching event handled');
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).send('Error handling webhook');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Tekmetric webhook listener running on port ${PORT}`));
