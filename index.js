const express = require('express');
const axios = require('axios');
const app = express();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!DISCORD_WEBHOOK_URL) {
  console.error('Error: DISCORD_WEBHOOK_URL environment variable not set.');
  process.exit(1);
}

app.use(express.json());

// Cache for customer name and RO number
// Key: repairOrderNumber (friendly RO #), value: customerName string
const customerCacheByRONumber = {};
// Key: repairOrderId (internal ID), value: repairOrderNumber (friendly #)
const roNumberCacheById = {};

app.post('/tekmetric-webhook', async (req, res) => {
  const payload = req.body;
  const event = payload.event || '';
  const data = payload.data || {};

  // Extract identifiers
  const repairOrderNumber = data.repairOrderNumber || null;
  const repairOrderId = data.id || data.repairOrderId || null;

  // Try to get customer name from payload data
  let customerName = 'Unknown Customer';
  if (data.customer?.firstName && data.customer?.lastName) {
    customerName = `${data.customer.firstName} ${data.customer.lastName}`;
  }

  // Cache customerName by repairOrderNumber if available
  if (repairOrderNumber && customerName !== 'Unknown Customer') {
    customerCacheByRONumber[repairOrderNumber] = customerName;
    console.log(`[CACHE] Stored customer name "${customerName}" for RO #${repairOrderNumber}`);
  }

  // Cache repairOrderNumber by repairOrderId
  if (repairOrderId && repairOrderNumber) {
    roNumberCacheById[repairOrderId] = repairOrderNumber;
    console.log(`[CACHE] Stored RO ID ${repairOrderId} => RO #${repairOrderNumber}`);
  }

  // For events that don’t have customer name or RO number directly,
  // try to find from cache using repairOrderNumber or repairOrderId
  // Priority order for customer name:
  // 1. customerCacheByRONumber[repairOrderNumber]
  // 2. Try event string parsing (only if event does NOT start with "Repair Order")
  // 3. fallback 'Unknown Customer'

  // Determine effective RO number
  let effectiveRONumber = repairOrderNumber;
  if (!effectiveRONumber && repairOrderId && roNumberCacheById[repairOrderId]) {
    effectiveRONumber = roNumberCacheById[repairOrderId];
    console.log(`[CACHE] Resolved RO #${effectiveRONumber} from RO ID ${repairOrderId}`);
  }
  if (!effectiveRONumber) {
    effectiveRONumber = 'Unknown';
  }

  // Determine effective customer name
  let effectiveCustomerName = customerName;
  if (effectiveCustomerName === 'Unknown Customer') {
    if (effectiveRONumber !== 'Unknown' && customerCacheByRONumber[effectiveRONumber]) {
      effectiveCustomerName = customerCacheByRONumber[effectiveRONumber];
      console.log(`[CACHE] Resolved customer name "${effectiveCustomerName}" from RO #${effectiveRONumber}`);
    } else {
      // Only parse if event string does NOT start with "Repair Order"
      if (!event.startsWith('Repair Order')) {
        const nameMatch = event.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
        if (nameMatch && nameMatch[1]) {
          effectiveCustomerName = nameMatch[1];
          console.log(`[NO CACHE] Parsed customer from event string: ${effectiveCustomerName}`);
        } else {
          console.log(`[NO CACHE] Customer name unknown`);
        }
      } else {
        console.log(`[NO CACHE] Event starts with 'Repair Order', skip parsing customer name from event string`);
      }
    }
  }

  let message = null;

  try {
    if (event.toLowerCase().includes('estimate') && event.toLowerCase().includes('viewed')) {
      message = `🧐 **Estimate Viewed**\n${effectiveCustomerName} viewed estimate for RO #${effectiveRONumber}`;
    } else if (event.toLowerCase().includes('approved') && event.toLowerCase().includes('declined')) {
      const approvedCount = data.jobs?.filter(job => job.authorized === true).length || 0;
      const declinedCount = data.jobs?.filter(job => job.authorized === false).length || 0;
      message = `🔧 **Work Authorization**\n${effectiveCustomerName} approved ${approvedCount} job(s) and declined ${declinedCount} job(s) for RO #${effectiveRONumber}`;
    } else if (data.repairOrderStatus?.name?.toLowerCase() === 'complete' || data.repairOrderStatus?.name?.toLowerCase() === 'completed') {
      message = `🎉 **RO Completed**\nRO #${effectiveRONumber} for ${effectiveCustomerName} is marked as completed.`;
    } else if (data.amountPaid && data.amountPaid > 0 && data.totalSales && data.amountPaid === data.totalSales) {
      const total = (data.amountPaid / 100).toFixed(2);
      message = `💳 **Payment Received**\nRO #${effectiveRONumber} for ${effectiveCustomerName} has been paid in full.\nTotal: $${total}`;
    } else if (event.toLowerCase().includes('payment made')) {
      const amount = data.amount ? (data.amount / 100).toFixed(2) : 'Unknown';
      const payer = data.payerName || effectiveCustomerName;
      message = `💵 **Payment Made**\n${payer} paid $${amount} for RO #${effectiveRONumber}`;
    } else if (event.toLowerCase().includes('inspection') && event.toLowerCase().includes('complete')) {
      message = `🔍 **Inspection Complete**\n${data.name || 'Inspection'} completed for RO #${effectiveRONumber} for ${effectiveCustomerName}`;
    } else if (event.toLowerCase().includes('purchase order') && event.toLowerCase().includes('received')) {
      const poMatch = event.match(/Purchase Order #(\d+)/);
      const poNumber = poMatch ? poMatch[1] : 'Unknown';
      message = `📦 **Part Received**\nPurchase Order #${poNumber} marked as received.`;
    }

    if (message) {
      await axios.post(DISCORD_WEBHOOK_URL, { content: message });
      console.log(`[MESSAGE SENT] ${message}`);
      res.status(200).send('Notification sent to Discord');
    } else {
      console.log(`[NO HANDLER] Event: "${event}"`);
      res.status(200).send('No matching event handled');
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).send('Error handling webhook');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Tekmetric webhook listener running on port ${PORT}`));
