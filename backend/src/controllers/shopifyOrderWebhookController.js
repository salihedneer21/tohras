const path = require('path');
const fetch = require('node-fetch');
const User = require('../models/User');
const { uploadBufferToS3, generateImageKey } = require('../config/s3');
const { getOrderCustomerImageUrls } = require('../scripts/shopifyOrderImages');

const URL_REGEX = /(https?:\/\/[^\s"')]+)/gi;
const IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|webp|gif|heic|heif|bmp|tiff?)(\?.*)?$/i;

const withNotProvided = (value) => {
  if (value === undefined || value === null) return 'Not Provided';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? 'Not Provided' : trimmed;
  }
  return value;
};

const toNumberOrNotProvided = (value) => {
  if (value === undefined || value === null) return 'Not Provided';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 'Not Provided';
  return numeric;
};

const normaliseGender = (value) => {
  if (!value || typeof value !== 'string') return undefined;
  const lower = value.trim().toLowerCase();
  if (['male', 'm', 'boy'].includes(lower)) return 'male';
  if (['female', 'f', 'girl'].includes(lower)) return 'female';
  if (['other', 'non-binary', 'nonbinary'].includes(lower)) return 'other';
  return undefined;
};

const parseAge = (value) => {
  if (value === null || value === undefined) return undefined;
  const numeric = Number.parseInt(String(value).trim(), 10);
  if (Number.isNaN(numeric) || numeric < 0 || numeric > 150) {
    return undefined;
  }
  return numeric;
};

const extractUrlsFromText = (text) => {
  if (typeof text !== 'string') return [];
  const matches = [];
  let match;
  while ((match = URL_REGEX.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
};

const filterImageUrls = (urls) =>
  urls.filter((url) => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed.startsWith('http')) return false;
    if (IMAGE_EXTENSION_REGEX.test(trimmed)) return true;
    if (trimmed.includes('cdn.shopify.com')) return true;
    return false;
  });

const buildShippingAddressFromOrder = (order, emailFromWebhook) => {
  if (!order || typeof order !== 'object') return null;

  const shipping =
    order.shipping_address ||
    order.default_address ||
    (order.customer && order.customer.default_address) ||
    null;

  if (!shipping) return null;

  const billing = order.billing_address || null;

  const resolvedEmail =
    emailFromWebhook ||
    order.email ||
    order.contact_email ||
    (order.customer && order.customer.email) ||
    null;

  const resolvedPhone =
    (shipping && shipping.phone) ||
    (billing && billing.phone) ||
    order.phone ||
    (order.customer && order.customer.phone) ||
    (order.customer &&
      order.customer.default_address &&
      order.customer.default_address.phone) ||
    null;

  const address = {
    country: shipping.country_code || shipping.country || null,
    firstName: shipping.first_name || null,
    lastName: shipping.last_name || null,
    addressLine1: shipping.address1 || null,
    addressLine2: shipping.address2 || null,
    city: shipping.city || null,
    postCode: shipping.zip || null,
    state: shipping.province_code || shipping.province || null,
    email: resolvedEmail,
    phone: resolvedPhone,
  };

  const cleaned = {};
  Object.keys(address).forEach((key) => {
    const value = address[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      cleaned[key] = String(value).trim();
    }
  });

  return Object.keys(cleaned).length > 0 ? cleaned : null;
};

const buildPrintOrderPayload = (
  order,
  emailFromWebhook,
  shopifyOrderKey,
  shippingAddressFromWebhook
) => {
  const baseShipping =
    shippingAddressFromWebhook || buildShippingAddressFromOrder(order, emailFromWebhook) || {};

  const shippingAddress = {
    country: withNotProvided(baseShipping.country),
    firstName: withNotProvided(baseShipping.firstName),
    lastName: withNotProvided(baseShipping.lastName),
    addressLine1: withNotProvided(baseShipping.addressLine1),
    addressLine2: withNotProvided(baseShipping.addressLine2),
    city: withNotProvided(baseShipping.city),
    postCode: withNotProvided(baseShipping.postCode),
    state: withNotProvided(baseShipping.state),
    email: withNotProvided(baseShipping.email),
    phone: withNotProvided(baseShipping.phone),
    companyName: 'My Torah Tales',
  };

  const shippingLines = Array.isArray(order && order.shipping_lines)
    ? order.shipping_lines
    : [];

  // Calculate shipping separately from product subtotal.
  // This will be used as retailShippingPriceInclVat in the payload.
  let shippingPrice = null;
  if (shippingLines.length > 0) {
    let totalShipping = 0;
    shippingLines.forEach((line) => {
      if (!line) return;
      let linePrice = null;
      if (line.price != null) {
        linePrice = line.price;
      } else if (line.discounted_price != null) {
        linePrice = line.discounted_price;
      } else if (
        line.price_set &&
        line.price_set.shop_money &&
        line.price_set.shop_money.amount != null
      ) {
        linePrice = line.price_set.shop_money.amount;
      }
      const numeric = Number(linePrice);
      if (!Number.isNaN(numeric)) {
        totalShipping += numeric;
      }
    });
    if (totalShipping > 0) {
      shippingPrice = totalShipping;
    }
  }

  const lineItems = Array.isArray(order && order.line_items) ? order.line_items : [];

  const items =
    lineItems.length > 0
      ? lineItems.map((item, index) => {
          if (!item) {
            return {
              itemReferenceId: 'Not Provided',
              productUid: 'Not Provided',
              quantity: 'Not Provided',
              files: [
                {
                  type: 'default',
                  url: 'Not Provided',
                },
              ],
            };
          }

          const referenceId =
            item.id ||
            item.variant_id ||
            item.sku ||
            `line-${index + 1}`;

          const productUidCandidate =
            item.sku ||
            item.variant_id ||
            item.product_id;

          const quantity = item.quantity != null ? item.quantity : null;

          // Derive total product price (subtotal) for this line.
          let retailPrice = null;
          if (item.line_price != null) {
            retailPrice = item.line_price;
          } else if (item.price != null && quantity != null) {
            const unit = Number(item.price);
            const qty = Number(quantity);
            if (!Number.isNaN(unit) && !Number.isNaN(qty)) {
              retailPrice = unit * qty;
            }
          } else if (
            item.price_set &&
            item.price_set.shop_money &&
            item.price_set.shop_money.amount != null &&
            quantity != null
          ) {
            const unit = Number(item.price_set.shop_money.amount);
            const qty = Number(quantity);
            if (!Number.isNaN(unit) && !Number.isNaN(qty)) {
              retailPrice = unit * qty;
            }
          }

          return {
            itemReferenceId: withNotProvided(referenceId),
            productUid: withNotProvided(productUidCandidate),
            quantity: toNumberOrNotProvided(quantity),
            retailPriceInclVat: toNumberOrNotProvided(retailPrice),
            files: [
              {
                type: 'default',
                url: 'Not Provided',
              },
            ],
          };
        })
      : [
          {
            itemReferenceId: 'Not Provided',
            productUid: 'Not Provided',
            quantity: 'Not Provided',
            retailPriceInclVat: 'Not Provided',
            files: [
              {
                type: 'default',
                url: 'Not Provided',
              },
            ],
          },
        ];

  const orderReferenceId =
    shopifyOrderKey ||
    resolveShopifyOrderKey(order) ||
    (order && order.id) ||
    (order && order.name) ||
    'Not Provided';

  const currencyCode = (order && order.currency) || 'Not Provided';

  return {
    orderReferenceId,
    orderType: 'order',
    currency: withNotProvided(currencyCode),
    retailCurrency: withNotProvided(currencyCode),
    retailShippingPriceInclVat: toNumberOrNotProvided(shippingPrice),
    shippingAddress,
    items,
  };
};

const resolveShopifyOrderKey = (order, summary = {}) => {
  const candidates = [];

  if (summary && summary.orderId != null) {
    candidates.push(summary.orderId);
  }
  if (order && order.id != null) {
    candidates.push(order.id);
  }
  if (order && order.admin_graphql_api_id) {
    candidates.push(order.admin_graphql_api_id);
  }
  if (order && order.name) {
    candidates.push(order.name);
  }
  if (typeof order?.order_number !== 'undefined') {
    candidates.push(order.order_number);
  }

  // Try to normalise to the numeric order ID
  // Handles:
  // - gid://shopify/Order/6440468873439
  // - 6440468873439
  // - #1036
  for (const raw of candidates) {
    const value = String(raw).trim();
    if (!value) continue;

    const gidMatch = value.match(/Order\/(\d+)/);
    if (gidMatch) {
      return gidMatch[1];
    }

    if (/^\d+$/.test(value)) {
      return value;
    }

    const hashMatch = value.match(/#(\d+)/);
    if (hashMatch) {
      return hashMatch[1];
    }
  }

  const last = candidates.length ? String(candidates[candidates.length - 1]).trim() : null;
  return last || null;
};

const deriveFileNameFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  try {
    const { pathname } = new URL(url);
    const base = path.basename(pathname);
    if (base) {
      return base.split('?')[0] || base;
    }
  } catch (error) {
    // Fallback to simple split
  }
  const parts = url.split('/');
  const last = parts[parts.length - 1] || '';
  return last.split('?')[0] || null;
};

const downloadImageFromUrl = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status} ${response.statusText})`);
  }
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = await response.buffer();
  return { buffer, contentType };
};

const copyShopifyImagesToUser = async (user, imageUrls) => {
  if (!user || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return { copied: 0, failed: 0 };
  }

  const existingNames = new Set(
    (user.imageAssets || [])
      .map((asset) => asset && asset.originalName)
      .filter((name) => typeof name === 'string' && name.trim())
  );

  let copied = 0;
  let failed = 0;

  for (let index = 0; index < imageUrls.length; index += 1) {
    const imageUrl = imageUrls[index];
    if (!imageUrl || typeof imageUrl !== 'string') continue;

    try {
      const { buffer, contentType } = await downloadImageFromUrl(imageUrl);
      const originalName =
        deriveFileNameFromUrl(imageUrl) || `shopify-image-${index + 1}.jpg`;

      // Skip if we've already imported this image (by original name)
      if (existingNames.has(originalName)) {
        // eslint-disable-next-line no-console
        console.log(
          `ℹ️  Skipping duplicate Shopify image for user ${user._id} with name ${originalName}`
        );
        continue;
      }

      const key = generateImageKey(user._id, originalName);
      const uploadResult = await uploadBufferToS3(buffer, key, contentType);

      const asset = {
        key,
        url: uploadResult.url,
        size: buffer.length,
        contentType: uploadResult.contentType || contentType,
        uploadedAt: new Date(),
        originalName,
      };

      user.imageAssets.push(asset);
      existingNames.add(originalName);
      copied += 1;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `⚠️  Failed to copy Shopify image for user ${user._id} from ${imageUrl}:`,
        error.message
      );
      failed += 1;
    }
  }

  if (copied > 0) {
    // Final safety: de-duplicate imageAssets on originalName/key in case of concurrent webhooks
    const seen = new Set();
    user.imageAssets = (user.imageAssets || []).filter((asset) => {
      if (!asset) return false;
      const id = asset.originalName || asset.key;
      if (!id) return true;
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });

    await user.save();
  }

  return { copied, failed };
};

const buildOrderSummaryFromWebhook = (order) => {
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const imageUrls = [];

  let bookName = null;
  let childName = null;
  let age = null;
  let gender = null;
  let dedication = null;

  const ageCandidates = [];
  const genderCandidates = [];
  const bookNameCandidates = [];
  const childNameCandidates = [];
  const dedicationCandidates = [];

  const collectFromAttributes = (attrs, keyProp = 'name', valueProp = 'value') => {
    if (!Array.isArray(attrs)) return;
    attrs.forEach((attr) => {
      const key = (attr?.[keyProp] || '').toString().toLowerCase();
      const value = (attr?.[valueProp] || '').toString();
      if (!key || !value) return;

      if (key.includes('age')) {
        ageCandidates.push(value);
      }
      if (key.includes('gender')) {
        genderCandidates.push(value);
      }
      if (key.includes('book') && key.includes('name')) {
        bookNameCandidates.push(value);
      }
      if (key.includes('child') && key.includes('name')) {
        childNameCandidates.push(value);
      }
      if (key.includes('dedication')) {
        dedicationCandidates.push(value);
      }

      const urlsInValue = extractUrlsFromText(value);
      const imageUrlsInValue = filterImageUrls(urlsInValue);
      imageUrls.push(...imageUrlsInValue);
    });
  };

  // Line item data (properties correspond to GraphQL customAttributes)
  lineItems.forEach((item) => {
    if (!item) return;

    if (!bookName && item.title) {
      bookName = item.title;
    }

    if (Array.isArray(item.properties)) {
      collectFromAttributes(item.properties, 'name', 'value');
    }
  });

  // Note attributes on the order
  if (Array.isArray(order.note_attributes)) {
    collectFromAttributes(order.note_attributes, 'name', 'value');
  }

  // Fallback dedication from order note
  if (!dedication && typeof order.note === 'string' && order.note.trim()) {
    dedication = order.note;
  }

  if (!bookName && bookNameCandidates.length) {
    bookName = bookNameCandidates[0];
  }

  if (!childName && childNameCandidates.length) {
    childName = childNameCandidates[0];
  }

  if (!age && ageCandidates.length) {
    age = ageCandidates[0];
  }

  if (!gender && genderCandidates.length) {
    gender = genderCandidates[0];
  }

  if (!dedication && dedicationCandidates.length) {
    dedication = dedicationCandidates[0];
  }

  const uniqueImageUrls = Array.from(new Set(imageUrls));

  return {
    orderId: order.id || null,
    orderName: order.name || null,
    bookName: bookName || null,
    childName: childName || null,
    age: age || null,
    gender: gender || null,
    dedication: dedication || null,
    imageUrls: uniqueImageUrls,
  };
};

const buildOrderSummary = async (order) => {
  const identifier =
    order.name ||
    (typeof order.order_number !== 'undefined' ? String(order.order_number) : null);

  if (identifier) {
    try {
      const graphqlSummary = await getOrderCustomerImageUrls(identifier);
      if (
        graphqlSummary &&
        (graphqlSummary.orderId ||
          (Array.isArray(graphqlSummary.imageUrls) && graphqlSummary.imageUrls.length > 0))
      ) {
        return graphqlSummary;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        '⚠️  Shopify GraphQL lookup failed, falling back to webhook payload:',
        error.message
      );
    }
  }

  return buildOrderSummaryFromWebhook(order);
};

exports.handleShopifyOrderCreated = async (req, res) => {
  const order = req.body;

  if (!order || typeof order !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Invalid Shopify order webhook payload',
    });
  }

  try {
    const summary = await buildOrderSummary(order);

    // Prefer email from webhook payload (REST order) to avoid PII limits in Admin API
    const emailFromWebhook =
      order.email ||
      order.contact_email ||
      (order.customer && order.customer.email) ||
      null;

    const fullSummary = {
      ...summary,
      email: emailFromWebhook,
    };

    const age = parseAge(fullSummary.age);
    const gender = normaliseGender(fullSummary.gender);

    const shopifyOrderKey = resolveShopifyOrderKey(order, fullSummary);

    const baseName =
      (fullSummary.childName && String(fullSummary.childName).trim()) ||
      (order.customer &&
        order.customer.first_name &&
        `${order.customer.first_name} ${order.customer.last_name || ''}`.trim()) ||
      (order.customer && order.customer.first_name) ||
      (order.customer && order.customer.last_name) ||
      (emailFromWebhook && emailFromWebhook.split('@')[0]) ||
      fullSummary.orderName ||
      `Shopify order`;

    const secondTitle =
      (fullSummary.dedication && String(fullSummary.dedication)) ||
      (order.note && String(order.note)) ||
      '';

    const shippingAddress = buildShippingAddressFromOrder(order, emailFromWebhook);
    const printOrderPayload = buildPrintOrderPayload(
      order,
      emailFromWebhook,
      shopifyOrderKey,
      shippingAddress
    );

    const userPayload = {
      name: baseName,
      secondTitle,
      email: emailFromWebhook || undefined,
      age,
      gender,
      status: 'active',
      imageAssets: [],
      shopifyOrderId: shopifyOrderKey,
      shopifyOrderName: fullSummary.orderName || (order.name && String(order.name)) || null,
      shopifyBookName: fullSummary.bookName || null,
      shippingAddress: shippingAddress || undefined,
      printOrderPayload,
    };

    Object.keys(userPayload).forEach((key) => {
      if (userPayload[key] === undefined || userPayload[key] === null) {
        delete userPayload[key];
      }
    });

    let user = shopifyOrderKey ? await User.findOne({ shopifyOrderId: shopifyOrderKey }) : null;

    if (!user) {
      user = await User.create(userPayload);
    } else {
      // Optionally refresh basic fields from latest payload
      user.name = userPayload.name || user.name;
      user.secondTitle = userPayload.secondTitle || user.secondTitle;
      user.email = userPayload.email || user.email;
      user.shopifyOrderName = userPayload.shopifyOrderName || user.shopifyOrderName;
      user.shopifyBookName = userPayload.shopifyBookName || user.shopifyBookName;
      if (userPayload.shippingAddress) {
        user.shippingAddress = userPayload.shippingAddress;
      }
      user.printOrderPayload = printOrderPayload;
      if (typeof age === 'number') user.age = age;
      if (gender) user.gender = gender;
      await user.save();
    }

    const imageUrls = Array.isArray(fullSummary.imageUrls)
      ? fullSummary.imageUrls
      : [];

    const copyResult = await copyShopifyImagesToUser(user, imageUrls);

    // Log in the same shape as the standalone script
    // eslint-disable-next-line no-console
    console.log(
      '📦 Shopify order summary:',
      JSON.stringify(
        {
          ...fullSummary,
          userId: user._id,
          copiedImages: copyResult.copied,
          failedImages: copyResult.failed,
        },
        null,
        2
      )
    );

    return res.status(200).json({
      success: true,
      received: true,
      summary: fullSummary,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        secondTitle: user.secondTitle,
        imageCount: Array.isArray(user.imageAssets) ? user.imageAssets.length : 0,
      },
      imageCopy: {
        requested: imageUrls.length,
        copied: copyResult.copied,
        failed: copyResult.failed,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Error processing Shopify order webhook:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process Shopify order webhook',
      error: error.message,
    });
  }
};
