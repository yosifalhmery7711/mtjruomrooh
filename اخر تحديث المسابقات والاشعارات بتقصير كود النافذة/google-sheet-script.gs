/**
 * Google Apps Script - كود بوابة الربط والمزامنة لمتجر أم روح
 * 
 * طريقة التركيب:
 * 1. اذهبي إلى Google Drive.
 * 2. انقري على (جديد / New) ثم (المزيد / More) ثم اخترتِ (Google Apps Script).
 * 3. امسحي الكود الافتراضي بالكامل والصقي هذا الكود مكانه.
 * 4. انقري على أيقونة الحفظ 💾.
 * 5. انقري على زر (Deploy / نشر) في الأعلى ثم اخترتِ (New deployment / نشر جديد).
 * 6. اضغطي على أيقونة الترس بجانب "Select type" واختاري (Web app / تطبيق ويب).
 * 7. قومي بتعبئة البيانات كالتالي:
 *    - Description: متجر أم روح قاعدة البيانات
 *    - Execute as: Me (بريدكِ الإلكتروني)
 *    - Who has access: Anyone (أي شخص) - **هام جداً لعمل المتجر**
 * 8. انقري على (Deploy / نشر)، سيطلب منكِ منح الصلاحيات (Authorize access)، انقري عليها واختاري حسابكِ ثم (Advanced / خيارات متقدمة) ثم (Go to Untitled project / انتقال إلى مشروع غير معروف) ثم (Allow / سماح).
 * 9. انسخي رابط "Web app URL" المتولد والصقيه في لوحة تحكم الإدارة بالمتجر.
 */

function doPost(e) {
  // تفعيل CORS وتمرير الطلبات بنجاح دون مشاكل متصفح
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "لا توجد بيانات مستلمة" }))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeaders(headers);
    }

    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;
    var ss = getOrCreateSpreadsheet();
    var responseData = { success: true, spreadsheetUrl: ss.getUrl() };

    if (action === 'syncAllData') {
      var allData = postData.allData;
      if (allData) {
        if (allData.products) saveArrayToSheet(ss, 'Products', allData.products);
        if (allData.categories) saveArrayToSheet(ss, 'Categories', allData.categories);
        if (allData.locations) saveArrayToSheet(ss, 'Locations', allData.locations);
        if (allData.orders) saveArrayToSheet(ss, 'Orders', allData.orders);
        if (allData.tickerTexts) saveSettingsRow(ss, 'TickerTexts', allData.tickerTexts);
        if (allData.settings) saveSettingsRow(ss, 'AdminSettings', allData.settings);
        if (allData.advisorSettings) saveSettingsRow(ss, 'AdvisorSettings', allData.advisorSettings);
        if (allData.exchangeRate) saveSettingsRow(ss, 'ExchangeRate', allData.exchangeRate);
        if (allData.notifications) saveArrayToSheet(ss, 'Notifications', allData.notifications);
        if (allData.targetedNotifications) saveArrayToSheet(ss, 'TargetedNotifications', allData.targetedNotifications);
        if (allData.targetedGifts) saveArrayToSheet(ss, 'TargetedGifts', allData.targetedGifts);
        if (allData.userTargetedGiftLogs) saveArrayToSheet(ss, 'TargetedGiftLogs', allData.userTargetedGiftLogs);
        if (allData.allUsers) saveArrayToSheet(ss, 'Users', allData.allUsers);
        if (allData.recharges) saveArrayToSheet(ss, 'Recharges', allData.recharges);
        if (allData.gifts) saveArrayToSheet(ss, 'Gifts', allData.gifts);
      }
      responseData = { success: true, message: "تمت مزامنة كافة البيانات السابقة بنجاح وحفظها في درايف!", spreadsheetUrl: ss.getUrl() };

    } else if (action === 'getProducts' || action === 'getAllData') {
      // إرسال كافة الجداول في اتصال واحد لضمان استقرار وسرعة التطبيق
      responseData = {
        success: true,
        spreadsheetUrl: ss.getUrl(),
        products: getArrayFromSheet(ss, 'Products'),
        categories: getArrayFromSheet(ss, 'Categories'),
        locations: getArrayFromSheet(ss, 'Locations'),
        orders: getArrayFromSheet(ss, 'Orders'),
        tickerTexts: getSettingsRow(ss, 'TickerTexts') || [],
        settings: getSettingsRow(ss, 'AdminSettings') || null,
        advisorSettings: getSettingsRow(ss, 'AdvisorSettings') || null,
        exchangeRate: getSettingsRow(ss, 'ExchangeRate') || null,
        notifications: getArrayFromSheet(ss, 'Notifications'),
        targetedNotifications: getArrayFromSheet(ss, 'TargetedNotifications'),
        targetedGifts: getArrayFromSheet(ss, 'TargetedGifts'),
        userTargetedGiftLogs: getArrayFromSheet(ss, 'TargetedGiftLogs'),
        allUsers: getArrayFromSheet(ss, 'Users'),
        recharges: getArrayFromSheet(ss, 'Recharges'),
        gifts: getArrayFromSheet(ss, 'Gifts')
      };

    } else if (action === 'saveProduct') {
      saveSingleItem(ss, 'Products', postData.product);
    } else if (action === 'deleteProduct') {
      deleteItemById(ss, 'Products', postData.productId);

    } else if (action === 'saveCategory') {
      saveSingleItem(ss, 'Categories', postData.category);
    } else if (action === 'deleteCategory') {
      deleteItemById(ss, 'Categories', postData.categoryId);

    } else if (action === 'saveLocation') {
      saveSingleItem(ss, 'Locations', postData.location);
    } else if (action === 'deleteLocation') {
      deleteItemById(ss, 'Locations', postData.id);

    } else if (action === 'saveUser') {
      saveSingleItem(ss, 'Users', postData.user);
    } else if (action === 'deleteUser') {
      deleteItemById(ss, 'Users', postData.userId);

    } else if (action === 'createOrder') {
      saveSingleItem(ss, 'Orders', postData.order);
    } else if (action === 'updateOrderStatus') {
      updateOrderStatus(ss, postData.id, postData.status);

    } else if (action === 'saveExchangeRate') {
      saveSettingsRow(ss, 'ExchangeRate', postData.rate);
    } else if (action === 'saveAdvisorSettings') {
      saveSettingsRow(ss, 'AdvisorSettings', postData.settings);
    } else if (action === 'saveAdminSettings') {
      saveSettingsRow(ss, 'AdminSettings', postData.settings);
    } else if (action === 'saveOffersImages') {
      saveSettingsRow(ss, 'OffersImages', postData.images);
    } else if (action === 'saveTickerTexts') {
      saveSettingsRow(ss, 'TickerTexts', postData.texts);

    } else if (action === 'saveTargetedNotification') {
      saveSingleItem(ss, 'TargetedNotifications', postData.notif);
    } else if (action === 'deleteTargetedNotification') {
      deleteItemById(ss, 'TargetedNotifications', postData.id);

    } else if (action === 'saveTargetedGift') {
      saveSingleItem(ss, 'TargetedGifts', postData.gift);
    } else if (action === 'deleteTargetedGift') {
      deleteItemById(ss, 'TargetedGifts', postData.id);

    } else if (action === 'saveUserTargetedGiftLog') {
      saveSingleItem(ss, 'TargetedGiftLogs', postData.log);
    }

    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(headers);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(headers);
  }
}

// دالة لمعالجة طلبات OPTIONS الخاصة بالمتصفحات
function doOptions(e) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders(headers);
}

// استرجاع أو إنشاء ملف السبريدشيت
function getOrCreateSpreadsheet() {
  var prop = PropertiesService.getScriptProperties();
  var ssId = prop.getProperty('SPREADSHEET_ID');
  var ss = null;

  if (ssId) {
    try {
      ss = SpreadsheetApp.openById(ssId);
    } catch (e) {
      prop.deleteProperty('SPREADSHEET_ID');
    }
  }

  if (!ss) {
    try {
      var files = DriveApp.getFilesByName("متجر أم روح - قاعدة البيانات (Google Sheets DB)");
      if (files.hasNext()) {
        var file = files.next();
        ssId = file.getId();
        ss = SpreadsheetApp.openById(ssId);
        prop.setProperty('SPREADSHEET_ID', ssId);
      }
    } catch (e) {
      // تجاهل الخطأ في حال لم تكن هناك صلاحيات لـ DriveApp وإنشاء سبريدشيت جديدة مباشرة
    }
    
    if (!ss) {
      ss = SpreadsheetApp.create("متجر أم روح - قاعدة البيانات (Google Sheets DB)");
      ssId = ss.getId();
      prop.setProperty('SPREADSHEET_ID', ssId);
    }
  }
  return ss;
}

// الحصول على ورقة عمل محددة أو إنشائها مع الأعمدة الأساسية
function getOrCreateSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // العمود الأول للمعرف الفريد، والثاني للبيانات بصيغة JSON لمرونة البيانات الكاملة وسهولة العرض البشري
    sheet.appendRow(["المعرف (ID)", "الاسم / الوصف (Human Label)", "بيانات العنصر الكاملة (JSON Data)", "آخر تحديث (Last Updated)"]);
    sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#FFF2CC");
  }
  return sheet;
}

// حفظ مصفوفة كاملة من البيانات في ورقة عمل مع تلافي التكرار
function saveArrayToSheet(ss, sheetName, items) {
  if (!Array.isArray(items)) return;
  var sheet = getOrCreateSheet(ss, sheetName);
  
  // قراءة المعرفات الموجودة لتجنب التكرار
  var lastRow = sheet.getLastRow();
  var existingIds = {};
  var idRows = {};
  
  if (lastRow > 1) {
    var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < idValues.length; i++) {
      var id = String(idValues[i][0]);
      existingIds[id] = true;
      idRows[id] = i + 2; // حفظ رقم السطر الحالي
    }
  }

  // إضافة أو تحديث العناصر
  items.forEach(function(item) {
    if (!item) return;
    var itemId = String(item.id || item.code || "");
    if (!itemId) return;

    var humanLabel = String(item.name || item.userName || item.text || item.title || "عنصر بيانات");
    var jsonData = JSON.stringify(item);
    var timestamp = new Date().toISOString();

    if (existingIds[itemId]) {
      // تحديث السطر الموجود
      var rowNum = idRows[itemId];
      sheet.getRange(rowNum, 2).setValue(humanLabel);
      sheet.getRange(rowNum, 3).setValue(jsonData);
      sheet.getRange(rowNum, 4).setValue(timestamp);
    } else {
      // إضافة سطر جديد
      sheet.appendRow([itemId, humanLabel, jsonData, timestamp]);
      var newRowNum = sheet.getLastRow();
      existingIds[itemId] = true;
      idRows[itemId] = newRowNum;
    }
  });
}

// استخراج البيانات كمصفوفة من ورقة عمل
function getArrayFromSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 3, lastRow - 1, 1).getValues(); // العمود الثالث يحتوي على الـ JSON
  var items = [];
  
  for (var i = 0; i < values.length; i++) {
    try {
      var jsonStr = values[i][0];
      if (jsonStr) {
        items.push(JSON.parse(jsonStr));
      }
    } catch (e) {
      // تجاهل الأخطاء البسيطة
    }
  }
  return items;
}

// حفظ عنصر واحد
function saveSingleItem(ss, sheetName, item) {
  if (!item) return;
  saveArrayToSheet(ss, sheetName, [item]);
}

// حذف عنصر بواسطة معرّفه الفريد
function deleteItemById(ss, sheetName, id) {
  if (!id) return;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < idValues.length; i++) {
    if (String(idValues[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      break;
    }
  }
}

// تحديث حالة الطلب
function updateOrderStatus(ss, orderId, status) {
  if (!orderId) return;
  var sheet = ss.getSheetByName('Orders');
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < idValues.length; i++) {
    if (String(idValues[i][0]) === String(orderId)) {
      var rowNum = i + 2;
      var jsonCell = sheet.getRange(rowNum, 3);
      try {
        var order = JSON.parse(jsonCell.getValue());
        order.status = status;
        jsonCell.setValue(JSON.stringify(order));
        sheet.getRange(rowNum, 4).setValue(new Date().toISOString());
      } catch (e) {}
      break;
    }
  }
}

// حفظ صفحة إعدادات (عنصر واحد فريد مثل أسعار الصرف أو إعدادات لوحة التحكم)
function saveSettingsRow(ss, keyName, settingsData) {
  if (!settingsData) return;
  var sheet = getOrCreateSheet(ss, 'Settings');
  
  var lastRow = sheet.getLastRow();
  var foundRow = 0;
  if (lastRow > 1) {
    var keyValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keyValues.length; i++) {
      if (String(keyValues[i][0]) === keyName) {
        foundRow = i + 2;
        break;
      }
    }
  }

  var jsonData = JSON.stringify(settingsData);
  var timestamp = new Date().toISOString();

  if (foundRow > 0) {
    sheet.getRange(foundRow, 3).setValue(jsonData);
    sheet.getRange(foundRow, 4).setValue(timestamp);
  } else {
    sheet.appendRow([keyName, "إعدادات " + keyName, jsonData, timestamp]);
  }
}

// جلب صفحة إعدادات
function getSettingsRow(ss, keyName) {
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) return null;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var keyValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < keyValues.length; i++) {
    if (String(keyValues[i][0]) === keyName) {
      try {
        var jsonStr = sheet.getRange(i + 2, 3).getValue();
        return JSON.parse(jsonStr);
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}
