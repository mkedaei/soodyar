import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, SafeAreaView, ScrollView, Share, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';

const KEYS = {
  products: 'soodyar_products_v1',
  sales: 'soodyar_sales_v1',
  purchases: 'soodyar_purchases_v2',
  customers: 'soodyar_customers_v2',
  expenses: 'soodyar_expenses_v2',
};

const STORE_SETTINGS_KEY = 'soodyar_store_settings_v1';
const digits = '۰۱۲۳۴۵۶۷۸۹';

const toNumber = value => {
  const normalized = String(value ?? '')
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  return Number(normalized.replace(/[^\d]/g, '')) || 0;
};

const format = value =>
  String(Math.round(Number(value) || 0))
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    .replace(/\d/g, d => digits[Number(d)]);

const formatInput = value => {
  const n = String(value ?? '')
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[^\d]/g, '');
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    .replace(/\d/g, d => digits[Number(d)]);
};

const toPersianDigits = value =>
  String(value).replace(/\d/g, d => digits[Number(d)]);

// تبدیل تاریخ میلادی به شمسی
const gregorianToJalali = (gy, gm, gd) => {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gm > 2 ? gy + 1 : gy;

  let days = 355666 + 365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd + gdm[gm - 1];

  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  let jm;
  let jd;

  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + days % 31;
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + (days - 186) % 30;
  }

  return [jy, jm, jd];
};

const dateText = date => {
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '---';

    const [y, m, day] = gregorianToJalali(
      d.getFullYear(),
      d.getMonth() + 1,
      d.getDate()
    );

    const time = toPersianDigits(
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    );

    return `${toPersianDigits(y)}/${toPersianDigits(String(m).padStart(2, '0'))}/${toPersianDigits(String(day).padStart(2, '0'))} - ${time}`;
  } catch {
    return '---';
  }
};

const productCost = p =>
  Number.isFinite(Number(p.avgCost))
    ? Number(p.avgCost)
    : toNumber(p.purchase) + toNumber(p.shipping) +
      toNumber(p.packaging) + toNumber(p.other);

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const sameDay = date =>
  new Date(date).toDateString() === new Date().toDateString();

const sameMonth = date => {
  const d = new Date(date);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
};

const Field = ({
  label, value, onChangeText, placeholder = '۰',
  numeric = true, multiline = false,
}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.multiline]}
      value={value}
      onChangeText={v => onChangeText(numeric ? formatInput(v) : v)}
      placeholder={placeholder}
      placeholderTextColor="#64748b"
      keyboardType={numeric ? 'number-pad' : 'default'}
      textAlign="right"
      writingDirection="rtl"
      multiline={multiline}
    />
  </View>
);

const Button = ({ title, onPress, secondary, danger, disabled }) => (
  <TouchableOpacity
    style={[
      styles.button,
      secondary && styles.secondaryButton,
      danger && styles.dangerButton,
      disabled && { opacity: 0.45 },
    ]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.85}
  >
    <Text style={[
      styles.buttonText,
      secondary && styles.secondaryButtonText,
      danger && styles.dangerButtonText,
    ]}>{title}</Text>
  </TouchableOpacity>
);

const Card = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

const Header = ({ title, subtitle }) => (
  <View style={styles.header}>
    <Text style={styles.headerTitle}>{title}</Text>
    {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
  </View>
);

const Stat = ({ title, value, unit = 'تومان' }) => (
  <Card style={styles.statCard}>
    <Text style={styles.statTitle}>{title}</Text>
    <Text style={styles.statValue}>{format(value)}</Text>
    <Text style={styles.statUnit}>{unit}</Text>
  </Card>
);

export default function App() {
  const [page, setPage] = useState('home');
  const [loaded, setLoaded] = useState(false);

  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [storeSettings, setStoreSettings] = useState({
    name: '',
    phone: '',
    address: '',
    website: '',
  });

  const [storeName, setStoreName] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storeWebsite, setStoreWebsite] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [shipping, setShipping] = useState('');
  const [packaging, setPackaging] = useState('');
  const [other, setOther] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [stock, setStock] = useState('');
  const [search, setSearch] = useState('');

  const [purchaseProductId, setPurchaseProductId] = useState(null);
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseUnitPrice, setPurchaseUnitPrice] = useState('');
  const [purchaseShipping, setPurchaseShipping] = useState('');
  const [purchasePackaging, setPurchasePackaging] = useState('');
  const [purchaseOther, setPurchaseOther] = useState('');
  const [purchaseCart, setPurchaseCart] = useState([]);

  const [saleProductId, setSaleProductId] = useState(null);
  const [saleQty, setSaleQty] = useState('');
  const [saleCart, setSaleCart] = useState([]);
  const [saleCustomerId, setSaleCustomerId] = useState(null);
  const [saleDiscount, setSaleDiscount] = useState('');
  const [saleShipping, setSaleShipping] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('paid');

  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const invoiceShotRef = useRef(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [backupText, setBackupText] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const entries = await Promise.all(
          Object.values(KEYS).map(k => AsyncStorage.getItem(k))
        );

        const parsed = entries.map(v => v ? JSON.parse(v) : []);

        setProducts(Array.isArray(parsed[0]) ? parsed[0] : []);
        setSales(Array.isArray(parsed[1]) ? parsed[1] : []);
        setPurchases(Array.isArray(parsed[2]) ? parsed[2] : []);
        setCustomers(Array.isArray(parsed[3]) ? parsed[3] : []);
        setExpenses(Array.isArray(parsed[4]) ? parsed[4] : []);

        const savedStore = await AsyncStorage.getItem(STORE_SETTINGS_KEY);

        if (savedStore) {
          const settings = JSON.parse(savedStore);
          setStoreSettings(settings);
          setStoreName(settings.name || '');
          setStorePhone(settings.phone || '');
          setStoreAddress(settings.address || '');
          setStoreWebsite(settings.website || '');
        }
      } catch {
        Alert.alert('خطا', 'خواندن اطلاعات ذخیره‌شده با مشکل مواجه شد.');
      } finally {
        setLoaded(true);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!loaded) return;

    const data = [products, sales, purchases, customers, expenses];

    Promise.all([
      ...Object.values(KEYS).map((key, i) =>
        AsyncStorage.setItem(key, JSON.stringify(data[i]))
      ),
      AsyncStorage.setItem(
        STORE_SETTINGS_KEY,
        JSON.stringify(storeSettings)
      ),
    ]).catch(() => Alert.alert('خطا', 'ذخیره اطلاعات با مشکل مواجه شد.'));
  }, [
    loaded, products, sales, purchases, customers, expenses, storeSettings,
  ]);

  const totalStock = products.reduce((s, p) => s + toNumber(p.stock), 0);
  const inventoryValue = products.reduce(
    (s, p) => s + productCost(p) * toNumber(p.stock), 0
  );
  const totalRevenue = sales.reduce((s, x) => s + toNumber(x.totalAmount), 0);
  const totalProfit = sales.reduce((s, x) => s + toNumber(x.profit), 0);
  const totalExpenses = expenses.reduce((s, x) => s + toNumber(x.amount), 0);

  const todaySales = sales.filter(x => sameDay(x.date));
  const monthSales = sales.filter(x => sameMonth(x.date));
  const todayRevenue = todaySales.reduce((s, x) => s + toNumber(x.totalAmount), 0);
  const todayProfit = todaySales.reduce((s, x) => s + toNumber(x.profit), 0);
  const monthRevenue = monthSales.reduce((s, x) => s + toNumber(x.totalAmount), 0);
  const monthProfit = monthSales.reduce((s, x) => s + toNumber(x.profit), 0);

  const todayExpenses = expenses.filter(x => sameDay(x.date))
    .reduce((s, x) => s + toNumber(x.amount), 0);

  const monthExpenses = expenses.filter(x => sameMonth(x.date))
    .reduce((s, x) => s + toNumber(x.amount), 0);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => String(p.name || '').toLowerCase().includes(q));
  }, [products, search]);

  const selectedPurchaseProduct = products.find(p => p.id === purchaseProductId);
  const selectedSaleProduct = products.find(p => p.id === saleProductId);
  const selectedInvoice = sales.find(x => x.id === selectedInvoiceId);

  const cartSubtotal = saleCart.reduce((s, x) => s + toNumber(x.totalAmount), 0);
  const cartProfit = saleCart.reduce((s, x) => s + toNumber(x.profit), 0);
  const discountValue = Math.min(toNumber(saleDiscount), cartSubtotal);
  const shippingValue = toNumber(saleShipping);
  const cartFinal = Math.max(0, cartSubtotal - discountValue + shippingValue);
  const cartFinalProfit = cartProfit - discountValue;

  const resetProductForm = () => {
    setEditingId(null);
    setName('');
    setPurchasePrice('');
    setShipping('');
    setPackaging('');
    setOther('');
    setSellPrice('');
    setStock('');
  };

  const saveStoreSettings = () => {
    if (!storeName.trim() || !storePhone.trim()) {
      Alert.alert('اطلاعات ناقص', 'نام فروشگاه و شماره تماس را وارد کن.');
      return;
    }

    const settings = {
      name: storeName.trim(),
      phone: storePhone.trim(),
      address: storeAddress.trim(),
      website: storeWebsite.trim(),
    };

    setStoreSettings(settings);
    Alert.alert('موفق', 'مشخصات فروشگاه ذخیره شد.');
    setPage('home');
  };

  const openStoreSettings = () => {
    setStoreName(storeSettings.name || '');
    setStorePhone(storeSettings.phone || '');
    setStoreAddress(storeSettings.address || '');
    setStoreWebsite(storeSettings.website || '');
    setPage('storeSettings');
  };

  const saveProduct = () => {
    if (!name.trim() || toNumber(purchasePrice) <= 0 || toNumber(sellPrice) <= 0) {
      Alert.alert('توجه', 'نام و قیمت خرید و فروش معتبر وارد کن.');
      return;
    }

    const cost = toNumber(purchasePrice) + toNumber(shipping) +
      toNumber(packaging) + toNumber(other);

    if (editingId) {
      setProducts(old => old.map(p => p.id === editingId ? {
        ...p,
        name: name.trim(),
        purchase: toNumber(purchasePrice),
        shipping: toNumber(shipping),
        packaging: toNumber(packaging),
        other: toNumber(other),
        sell: toNumber(sellPrice),
        stock: toNumber(stock),
        avgCost: cost,
      } : p));
    } else {
      setProducts(old => [{
        id: makeId(),
        name: name.trim(),
        purchase: toNumber(purchasePrice),
        shipping: toNumber(shipping),
        packaging: toNumber(packaging),
        other: toNumber(other),
        sell: toNumber(sellPrice),
        stock: toNumber(stock),
        avgCost: cost,
      }, ...old]);
    }

    resetProductForm();
    setPage('products');
    Alert.alert('موفق', editingId ? 'محصول ویرایش شد.' : 'محصول ثبت شد.');
  };

  const editProduct = p => {
    setEditingId(p.id);
    setName(p.name);
    setPurchasePrice(formatInput(p.purchase));
    setShipping(formatInput(p.shipping));
    setPackaging(formatInput(p.packaging));
    setOther(formatInput(p.other));
    setSellPrice(formatInput(p.sell));
    setStock(formatInput(p.stock));
    setPage('productForm');
  };

  const deleteProduct = id => {
    Alert.alert('حذف محصول', 'از حذف این محصول مطمئنی؟', [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => setProducts(old => old.filter(p => p.id !== id)),
      },
    ]);
  };

  const addPurchaseLine = () => {
    const qty = toNumber(purchaseQty);

    if (!selectedPurchaseProduct || qty <= 0 || toNumber(purchaseUnitPrice) <= 0) {
      Alert.alert('توجه', 'محصول، تعداد و قیمت خرید را مشخص کن.');
      return;
    }

    const unitCost = toNumber(purchaseUnitPrice) +
      toNumber(purchaseShipping) + toNumber(purchasePackaging) +
      toNumber(purchaseOther);

    setPurchaseCart(old => {
      const existing = old.find(x => x.productId === selectedPurchaseProduct.id);

      if (existing) {
        return old.map(x => x.productId === existing.productId
          ? {
              ...x,
              quantity: x.quantity + qty,
              totalCost: x.totalCost + unitCost * qty,
            }
          : x);
      }

      return [...old, {
        productId: selectedPurchaseProduct.id,
        productName: selectedPurchaseProduct.name,
        quantity: qty,
        unitCost,
        totalCost: unitCost * qty,
      }];
    });

    setPurchaseProductId(null);
    setPurchaseQty('');
    setPurchaseUnitPrice('');
    setPurchaseShipping('');
    setPurchasePackaging('');
    setPurchaseOther('');
  };

  const finishPurchase = () => {
    if (!purchaseCart.length) {
      Alert.alert('توجه', 'ابتدا کالاها را به فاکتور اضافه کن.');
      return;
    }

    const date = new Date().toISOString();

    setProducts(old => old.map(p => {
      const line = purchaseCart.find(x => x.productId === p.id);
      if (!line) return p;

      const oldQty = toNumber(p.stock);
      const newQty = oldQty + line.quantity;
      const oldCost = productCost(p);
      const average = newQty > 0
        ? ((oldCost * oldQty) + line.totalCost) / newQty
        : line.unitCost;

      return {
        ...p,
        stock: newQty,
        avgCost: average,
        purchase: Math.round(average),
        shipping: 0,
        packaging: 0,
        other: 0,
      };
    }));

    setPurchases(old => [{
      id: makeId(),
      date,
      items: purchaseCart,
      totalAmount: purchaseCart.reduce((s, x) => s + x.totalCost, 0),
    }, ...old]);

    setPurchaseCart([]);
    setPage('history');
    Alert.alert('خرید ثبت شد', 'موجودی و میانگین قیمت خرید محصولات به‌روزرسانی شد.');
  };

  const addSaleLine = () => {
    const qty = toNumber(saleQty);

    if (!selectedSaleProduct || qty <= 0) {
      Alert.alert('توجه', 'محصول و تعداد فروش را مشخص کن.');
      return;
    }

    const alreadyInCart = saleCart
      .filter(x => x.productId === selectedSaleProduct.id)
      .reduce((s, x) => s + x.quantity, 0);

    if (qty + alreadyInCart > toNumber(selectedSaleProduct.stock)) {
      Alert.alert('موجودی کافی نیست', `موجودی قابل فروش: ${format(
        toNumber(selectedSaleProduct.stock) - alreadyInCart
      )} عدد`);
      return;
    }

    const unitCost = productCost(selectedSaleProduct);
    const unitPrice = toNumber(selectedSaleProduct.sell);

    setSaleCart(old => [...old, {
      productId: selectedSaleProduct.id,
      productName: selectedSaleProduct.name,
      quantity: qty,
      unitPrice,
      unitCost,
      totalAmount: unitPrice * qty,
      profit: (unitPrice - unitCost) * qty,
    }]);

    setSaleProductId(null);
    setSaleQty('');
  };

  const finishSale = () => {
    if (!storeSettings.name?.trim() || !storeSettings.phone?.trim()) {
      Alert.alert(
        'ثبت مشخصات فروشگاه',
        'برای صدور فاکتور ابتدا نام فروشگاه و شماره تماس را ثبت کن.',
        [
          { text: 'بعداً', style: 'cancel' },
          { text: 'ثبت مشخصات', onPress: openStoreSettings },
        ]
      );
      return;
    }

    if (!saleCart.length) {
      Alert.alert('توجه', 'ابتدا محصولات فاکتور را اضافه کن.');
      return;
    }

    const date = new Date().toISOString();
    const invoiceId = makeId();
    const invoiceNumber = `SD-${Date.now().toString().slice(-9)}`;
    const customer = customers.find(c => c.id === saleCustomerId);

    const invoice = {
      id: invoiceId,
      invoiceNumber,
      date,
      seller: { ...storeSettings },
      customerId: saleCustomerId,
      customerName: customer?.name || 'مشتری آزاد',
      customerPhone: customer?.phone || '',
      items: saleCart,
      quantity: saleCart.reduce((s, x) => s + x.quantity, 0),
      subtotal: cartSubtotal,
      discount: discountValue,
      shippingCharge: shippingValue,
      totalAmount: cartFinal,
      profit: cartFinalProfit,
      paymentStatus,
    };

    setProducts(old => old.map(p => {
      const qty = saleCart
        .filter(x => x.productId === p.id)
        .reduce((s, x) => s + x.quantity, 0);
      return qty ? { ...p, stock: toNumber(p.stock) - qty } : p;
    }));

    setSales(old => [invoice, ...old]);
    setSelectedInvoiceId(invoiceId);
    setSaleCart([]);
    setSaleCustomerId(null);
    setSaleDiscount('');
    setSaleShipping('');
    setPaymentStatus('paid');
    setSaleProductId(null);
    setSaleQty('');
    setPage('invoiceDetail');

    Alert.alert('فاکتور ثبت شد', `شماره فاکتور: ${invoiceNumber}`);
  };

  const openInvoice = invoice => {
    setSelectedInvoiceId(invoice.id);
    setPage('invoiceDetail');
  };

  const getInvoiceItems = invoice => {
    if (invoice?.items?.length) return invoice.items;

    if (invoice?.productName) {
      return [{
        productName: invoice.productName,
        quantity: invoice.quantity || 1,
        unitPrice: invoice.unitPrice || invoice.totalAmount || 0,
        totalAmount: invoice.totalAmount || 0,
        profit: invoice.profit || 0,
      }];
    }

    return [];
  };

  const shareInvoiceImage = async () => {
    try {
      if (!invoiceShotRef.current) {
        Alert.alert('خطا', 'تصویر فاکتور آماده نیست.');
        return;
      }

      const uri = await invoiceShotRef.current.capture();
      const available = await Sharing.isAvailableAsync();

      if (!available) {
        Alert.alert('خطا', 'اشتراک‌گذاری در این دستگاه در دسترس نیست.');
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'ارسال فاکتور سودیار',
        UTI: 'public.png',
      });
    } catch {
      Alert.alert('خطا', 'ساخت یا اشتراک‌گذاری تصویر فاکتور انجام نشد.');
    }
  };

  const saveInvoiceImage = async () => {
    try {
      if (!invoiceShotRef.current) {
        Alert.alert('خطا', 'تصویر فاکتور آماده نیست.');
        return;
      }

      const permission = await MediaLibrary.requestPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('دسترسی لازم است', 'برای ذخیره تصویر، اجازه دسترسی به گالری را فعال کن.');
        return;
      }

      const uri = await invoiceShotRef.current.capture();
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('ذخیره شد', 'تصویر فاکتور در گالری گوشی ذخیره شد.');
    } catch {
      Alert.alert('خطا', 'ذخیره تصویر انجام نشد. دوباره امتحان کن.');
    }
  };

  const addCustomer = () => {
    if (!customerName.trim()) {
      Alert.alert('توجه', 'نام مشتری را وارد کن.');
      return;
    }

    setCustomers(old => [{
      id: makeId(),
      name: customerName.trim(),
      phone: customerPhone.trim(),
      note: customerNote.trim(),
      createdAt: new Date().toISOString(),
    }, ...old]);

    setCustomerName('');
    setCustomerPhone('');
    setCustomerNote('');
    setPage('customers');
    Alert.alert('موفق', 'مشتری ثبت شد.');
  };

  const addExpense = () => {
    if (!expenseTitle.trim() || toNumber(expenseAmount) <= 0) {
      Alert.alert('توجه', 'عنوان و مبلغ هزینه را وارد کن.');
      return;
    }

    setExpenses(old => [{
      id: makeId(),
      title: expenseTitle.trim(),
      amount: toNumber(expenseAmount),
      note: expenseNote.trim(),
      date: new Date().toISOString(),
    }, ...old]);

    setExpenseTitle('');
    setExpenseAmount('');
    setExpenseNote('');
    setPage('expenses');
    Alert.alert('موفق', 'هزینه ثبت شد.');
  };

  const exportBackup = async () => {
    const backup = {
      app: 'Soodyar',
      version: '2.2.0',
      createdAt: new Date().toISOString(),
      products,
      sales,
      purchases,
      customers,
      expenses,
      storeSettings,
    };

    try {
      await Share.share({
        message: JSON.stringify(backup),
        title: 'پشتیبان سودیار',
      });
    } catch {
      Alert.alert('خطا', 'اشتراک‌گذاری پشتیبان انجام نشد.');
    }
  };

  const importBackup = () => {
    try {
      const data = JSON.parse(backupText);

      if (!data || !Array.isArray(data.products) || !Array.isArray(data.sales)) {
        throw new Error('invalid');
      }

      Alert.alert(
        'بازیابی اطلاعات',
        'اطلاعات فعلی با اطلاعات پشتیبان جایگزین می‌شوند. ادامه می‌دهی؟',
        [
          { text: 'انصراف', style: 'cancel' },
          {
            text: 'بازیابی',
            onPress: () => {
              setProducts(data.products || []);
              setSales(data.sales || []);
              setPurchases(data.purchases || []);
              setCustomers(data.customers || []);
              setExpenses(data.expenses || []);

              if (data.storeSettings) {
                setStoreSettings(data.storeSettings);
                setStoreName(data.storeSettings.name || '');
                setStorePhone(data.storeSettings.phone || '');
                setStoreAddress(data.storeSettings.address || '');
                setStoreWebsite(data.storeSettings.website || '');
              }

              setBackupText('');
              setPage('home');
              Alert.alert('موفق', 'اطلاعات پشتیبان بازیابی شد.');
            },
          },
        ]
      );
    } catch {
      Alert.alert('پشتیبان نامعتبر', 'متن پشتیبان کامل و معتبر نیست.');
    }
  };

  const menu = [
    ['🧮', 'محاسبه سود', 'calculator'],
    ['📦', 'محصولات و انبار', 'products'],
    ['🛒', 'ثبت خرید گروهی', 'purchase'],
    ['🧾', 'ثبت فروش گروهی', 'sale'],
    ['📚', 'سوابق فاکتورها', 'history'],
    ['👥', 'مشتریان', 'customers'],
    ['💸', 'هزینه‌ها', 'expenses'],
    ['📊', 'گزارش مالی', 'reports'],
    ['💾', 'پشتیبان‌گیری', 'backup'],
    ['⚙️', 'تنظیمات فروشگاه', 'storeSettings'],
  ];

  const renderHome = () => (
    <>
      <Header title="سودیار" subtitle="مدیر هوشمند فروشگاه شما" />

      <View style={styles.welcomeBox}>
        <Text style={styles.welcomeTitle}>خوش اومدی 👋</Text>
        <Text style={styles.welcomeText}>
          امروز کسب‌وکارت چه وضعیتی داره؟
        </Text>
      </View>

      <Text style={styles.sectionTitle}>نمای کلی کسب‌وکار</Text>

      <View style={styles.statsGrid}>
        <Stat title="تعداد محصولات" value={products.length} unit="محصول" />
        <Stat title="موجودی انبار" value={totalStock} unit="عدد" />
        <Stat title="ارزش انبار" value={inventoryValue} />
        <Stat title="مجموع فروش" value={totalRevenue} />
        <Stat title="سود ثبت‌شده" value={totalProfit} />
        <Stat title="هزینه‌های ثبت‌شده" value={totalExpenses} />
      </View>

      <Text style={styles.sectionTitle}>عملکرد امروز</Text>

      <View style={styles.statsGrid}>
        <Stat title="فروش امروز" value={todayRevenue} />
        <Stat title="سود امروز" value={todayProfit} />
      </View>

      <Text style={styles.sectionTitle}>ابزارهای سودیار</Text>

      <View style={styles.menuGrid}>
        {menu.map(([icon, title, target]) => (
          <TouchableOpacity
            key={target}
            style={styles.menuItem}
            onPress={() => target === 'storeSettings'
              ? openStoreSettings()
              : setPage(target)}
          >
            <Text style={styles.menuIcon}>{icon}</Text>
            <Text style={styles.menuTitle}>{title}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  const renderStoreSettings = () => (
    <>
      <Header
        title="تنظیمات فروشگاه"
        subtitle="این اطلاعات در فاکتورهای جدید نمایش داده می‌شوند"
      />

      <Card>
        <Field
          label="نام فروشگاه *"
          value={storeName}
          onChangeText={setStoreName}
          numeric={false}
          placeholder="مثلاً فروشگاه سودیار"
        />

        <Field
          label="شماره تماس *"
          value={storePhone}
          onChangeText={setStorePhone}
          numeric={false}
          placeholder="شماره تماس فروشگاه"
        />

        <Field
          label="آدرس فروشگاه"
          value={storeAddress}
          onChangeText={setStoreAddress}
          numeric={false}
          placeholder="آدرس فروشگاه"
          multiline
        />

        <Field
          label="وب‌سایت یا صفحه فروشگاه"
          value={storeWebsite}
          onChangeText={setStoreWebsite}
          numeric={false}
          placeholder="مثلاً example.com"
        />

        <Text style={styles.muted}>
          موارد ستاره‌دار برای صدور فاکتور الزامی هستند.
        </Text>

        <Button title="ذخیره مشخصات فروشگاه" onPress={saveStoreSettings} />

        <Button
          title="بازگشت"
          secondary
          onPress={() => setPage('home')}
        />
      </Card>
    </>
  );

  const renderProducts = () => (
    <>
      <Header title="محصولات و انبار" subtitle="مدیریت کالاها و موجودی فروشگاه" />

      <Button title="افزودن محصول جدید +" onPress={() => {
        resetProductForm();
        setPage('productForm');
      }} />

      <Field
        label="جستجوی محصول"
        value={search}
        onChangeText={setSearch}
        numeric={false}
        placeholder="نام محصول..."
      />

      {filteredProducts.length === 0
        ? <Card><Text style={styles.emptyText}>محصولی پیدا نشد.</Text></Card>
        : filteredProducts.map(p => (
          <Card key={p.id}>
            <Text style={styles.productName}>{p.name}</Text>
            <InfoRow label="موجودی" value={`${format(p.stock)} عدد`} />
            <InfoRow label="میانگین بهای تمام‌شده" value={`${format(productCost(p))} تومان`} />
            <InfoRow label="قیمت فروش" value={`${format(p.sell)} تومان`} />
            <InfoRow
              label="سود هر عدد"
              value={`${format(toNumber(p.sell) - productCost(p))} تومان`}
            />

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.smallButton} onPress={() => editProduct(p)}>
                <Text style={styles.smallButtonText}>✏️ ویرایش</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallButton, styles.deleteButton]}
                onPress={() => deleteProduct(p.id)}
              >
                <Text style={styles.deleteText}>حذف</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))}
    </>
  );

  const renderProductForm = () => (
    <>
      <Header
        title={editingId ? 'ویرایش محصول' : 'افزودن محصول'}
        subtitle="مشخصات کالا را وارد کن"
      />

      <Card>
        <Field label="نام محصول" value={name} onChangeText={setName}
          numeric={false} placeholder="مثلاً اسپیکر بلوتوثی" />
        <Field label="قیمت خرید هر عدد" value={purchasePrice} onChangeText={setPurchasePrice} />
        <Field label="هزینه ارسال هر عدد" value={shipping} onChangeText={setShipping} />
        <Field label="هزینه بسته‌بندی هر عدد" value={packaging} onChangeText={setPackaging} />
        <Field label="سایر هزینه هر عدد" value={other} onChangeText={setOther} />
        <Field label="قیمت فروش" value={sellPrice} onChangeText={setSellPrice} />
        <Field label="موجودی فعلی" value={stock} onChangeText={setStock} />

        <Button title="ذخیره محصول" onPress={saveProduct} />

        <Button title="انصراف" secondary onPress={() => {
          resetProductForm();
          setPage('products');
        }} />
      </Card>
    </>
  );

  const renderPurchase = () => (
    <>
      <Header title="خرید گروهی" subtitle="چند کالا را در یک فاکتور خرید ثبت کن" />

      <Card>
        <Text style={styles.sectionTitle}>انتخاب محصول</Text>

        {products.map(p => (
          <TouchableOpacity key={p.id} onPress={() => setPurchaseProductId(p.id)}>
            <View style={[
              styles.selectRow,
              purchaseProductId === p.id && styles.selected,
            ]}>
              <Text style={styles.productName}>{p.name}</Text>
              <Text style={styles.muted}>
                {purchaseProductId === p.id ? '✓ انتخاب شد' : `موجودی: ${format(p.stock)}`}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {selectedPurchaseProduct && <>
          <Field label="تعداد خرید" value={purchaseQty} onChangeText={setPurchaseQty} />
          <Field label="قیمت خرید هر عدد" value={purchaseUnitPrice} onChangeText={setPurchaseUnitPrice} />
          <Field label="هزینه ارسال هر عدد" value={purchaseShipping} onChangeText={setPurchaseShipping} />
          <Field label="بسته‌بندی هر عدد" value={purchasePackaging} onChangeText={setPurchasePackaging} />
          <Field label="سایر هزینه هر عدد" value={purchaseOther} onChangeText={setPurchaseOther} />
          <Button title="افزودن به فاکتور خرید" onPress={addPurchaseLine} />
        </>}
      </Card>

      <Text style={styles.sectionTitle}>اقلام فاکتور خرید</Text>

      {purchaseCart.map((x, i) => (
        <Card key={`${x.productId}_${i}`}>
          <Text style={styles.productName}>{x.productName}</Text>
          <Text style={styles.muted}>تعداد: {format(x.quantity)}</Text>
          <Text style={styles.infoValue}>جمع: {format(x.totalCost)} تومان</Text>
          <Button
            title="حذف از فاکتور"
            danger
            onPress={() => setPurchaseCart(old => old.filter((_, index) => index !== i))}
          />
        </Card>
      ))}

      <Card>
        <Text style={styles.resultLabel}>جمع فاکتور خرید</Text>
        <Text style={styles.resultValue}>
          {format(purchaseCart.reduce((s, x) => s + x.totalCost, 0))} تومان
        </Text>
        <Button title="ثبت نهایی فاکتور خرید" onPress={finishPurchase} />
        <Button title="خالی کردن فاکتور" secondary onPress={() => setPurchaseCart([])} />
      </Card>
    </>
  );

  const renderSale = () => (
    <>
      <Header title="فروش گروهی" subtitle="چند کالا را در یک فاکتور بفروش" />

      <Card>
        <Text style={styles.sectionTitle}>انتخاب مشتری (اختیاری)</Text>

        <TouchableOpacity onPress={() => setSaleCustomerId(null)}>
          <Text style={[styles.selectRow, !saleCustomerId && styles.selected]}>
            مشتری آزاد / بدون انتخاب
          </Text>
        </TouchableOpacity>

        {customers.map(c => (
          <TouchableOpacity key={c.id} onPress={() => setSaleCustomerId(c.id)}>
            <Text style={[styles.selectRow, saleCustomerId === c.id && styles.selected]}>
              {c.name} {c.phone ? `- ${c.phone}` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>انتخاب کالا</Text>

        {products.map(p => (
          <TouchableOpacity key={p.id} onPress={() => setSaleProductId(p.id)}>
            <View style={[
              styles.selectRow,
              saleProductId === p.id && styles.selected,
            ]}>
              <Text style={styles.productName}>{p.name}</Text>
              <Text style={styles.muted}>
                موجودی: {format(p.stock)} | {format(p.sell)} تومان
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {selectedSaleProduct && <>
          <Field label="تعداد فروش" value={saleQty} onChangeText={setSaleQty} />
          <Button title="افزودن به فاکتور فروش" onPress={addSaleLine} />
        </>}
      </Card>

      <Text style={styles.sectionTitle}>اقلام فاکتور فروش</Text>

      {saleCart.map((x, i) => (
        <Card key={`${x.productId}_${i}`}>
          <Text style={styles.productName}>{x.productName}</Text>
          <Text style={styles.muted}>تعداد: {format(x.quantity)}</Text>
          <Text style={styles.infoValue}>مبلغ: {format(x.totalAmount)} تومان</Text>
          <Text style={styles.muted}>سود: {format(x.profit)} تومان</Text>
          <Button
            title="حذف از فاکتور"
            danger
            onPress={() => setSaleCart(old => old.filter((_, index) => index !== i))}
          />
        </Card>
      ))}

      <Card>
        <Field label="تخفیف فاکتور (تومان)" value={saleDiscount}
          onChangeText={setSaleDiscount} />
        <Field label="هزینه ارسال دریافتی از مشتری (تومان)" value={saleShipping}
          onChangeText={setSaleShipping} />

        <Text style={styles.fieldLabel}>وضعیت پرداخت</Text>

        <View style={styles.statusRow}>
          <TouchableOpacity
            onPress={() => setPaymentStatus('paid')}
            style={[styles.statusOption, paymentStatus === 'paid' && styles.statusSelected]}
          >
            <Text style={styles.statusText}>پرداخت شده</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setPaymentStatus('unpaid')}
            style={[styles.statusOption, paymentStatus === 'unpaid' && styles.statusSelected]}
          >
            <Text style={styles.statusText}>پرداخت نشده</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <InfoRow label="جمع کالاها" value={`${format(cartSubtotal)} تومان`} />
        <InfoRow label="تخفیف" value={`${format(discountValue)} تومان`} />
        <InfoRow label="هزینه ارسال" value={`${format(shippingValue)} تومان`} />

        <Text style={styles.resultLabel}>مبلغ نهایی فاکتور</Text>
        <Text style={styles.resultValue}>{format(cartFinal)} تومان</Text>

        <Text style={styles.resultLabel}>سود تقریبی فاکتور پس از تخفیف</Text>
        <Text style={styles.resultValue}>{format(cartFinalProfit)} تومان</Text>

        <Button title="ثبت نهایی و ساخت فاکتور" onPress={finishSale} />

        <Button title="خالی کردن فاکتور" secondary onPress={() => {
          setSaleCart([]);
          setSaleDiscount('');
          setSaleShipping('');
        }} />
      </Card>
    </>
  );

  const renderInvoiceDetail = () => {
    if (!selectedInvoice) {
      return (
        <>
          <Header title="فاکتور" />
          <Card><Text style={styles.emptyText}>فاکتور موردنظر پیدا نشد.</Text></Card>
          <Button title="بازگشت به سوابق" onPress={() => setPage('history')} />
        </>
      );
    }

    const items = getInvoiceItems(selectedInvoice);
    const subtotal = selectedInvoice.subtotal ??
      items.reduce((s, x) => s + toNumber(x.totalAmount), 0);
    const discount = toNumber(selectedInvoice.discount);
    const shippingCharge = toNumber(selectedInvoice.shippingCharge);
    const finalAmount = toNumber(selectedInvoice.totalAmount);
    const invoiceNumber = selectedInvoice.invoiceNumber || selectedInvoice.id;
    const paid = selectedInvoice.paymentStatus !== 'unpaid';
    const seller = selectedInvoice.seller || {};

    return (
      <>
        <Header title="جزئیات فاکتور" subtitle="فاکتور را ذخیره یا برای مشتری ارسال کن" />

        <ViewShot
          ref={invoiceShotRef}
          options={{ format: 'png', quality: 1, result: 'tmpfile' }}
        >
          <View style={styles.invoicePaper}>
            <View style={styles.invoiceTop}>
              <Text style={styles.invoiceBrand}>سودیار</Text>
              <Text style={styles.invoiceTag}>فاکتور فروش</Text>
            </View>

            <View style={styles.invoiceLine} />

            <View style={styles.invoiceSeller}>
              <Text style={styles.invoiceSection}>مشخصات فروشنده</Text>
              <Text style={styles.invoiceText}>
                نام فروشگاه: {seller.name || 'ثبت نشده'}
              </Text>
              <Text style={styles.invoiceText}>
                تلفن: {seller.phone || 'ثبت نشده'}
              </Text>
              {!!seller.address && (
                <Text style={styles.invoiceText}>آدرس: {seller.address}</Text>
              )}
              {!!seller.website && (
                <Text style={styles.invoiceText}>وب‌سایت: {seller.website}</Text>
              )}
            </View>

            <Text style={styles.invoiceNumber}>
              شماره فاکتور: {invoiceNumber}
            </Text>

            <Text style={styles.invoiceDate}>
              تاریخ: {dateText(selectedInvoice.date)}
            </Text>

            <View style={styles.invoiceCustomer}>
              <Text style={styles.invoiceSection}>مشخصات مشتری</Text>
              <Text style={styles.invoiceText}>
                نام: {selectedInvoice.customerName || 'مشتری آزاد'}
              </Text>
              {!!selectedInvoice.customerPhone && (
                <Text style={styles.invoiceText}>
                  تلفن: {selectedInvoice.customerPhone}
                </Text>
              )}
            </View>

            <Text style={styles.invoiceSection}>اقلام خریداری‌شده</Text>

            <View style={styles.invoiceTableHead}>
              <Text style={[styles.invoiceCell, { flex: 3 }]}>محصول</Text>
              <Text style={styles.invoiceCell}>تعداد</Text>
              <Text style={[styles.invoiceCell, { flex: 2 }]}>مبلغ</Text>
            </View>

            {items.map((item, i) => (
              <View key={i} style={styles.invoiceTableRow}>
                <Text style={[styles.invoiceCell, { flex: 3 }]}>
                  {item.productName}
                </Text>
                <Text style={styles.invoiceCell}>{format(item.quantity)}</Text>
                <Text style={[styles.invoiceCell, { flex: 2 }]}>
                  {format(item.totalAmount ?? item.unitPrice * item.quantity)}
                </Text>
              </View>
            ))}

            <View style={styles.invoiceLine} />

            <InvoiceRow label="جمع کالاها" value={subtotal} />
            {discount > 0 && <InvoiceRow label="تخفیف" value={discount} />}
            {shippingCharge > 0 && (
              <InvoiceRow label="هزینه ارسال" value={shippingCharge} />
            )}

            <View style={styles.invoiceTotal}>
              <Text style={styles.invoiceTotalLabel}>مبلغ نهایی</Text>
              <Text style={styles.invoiceTotalValue}>
                {format(finalAmount)} تومان
              </Text>
            </View>

            <View style={[styles.paymentBadge, !paid && styles.unpaidBadge]}>
              <Text style={styles.paymentText}>
                {paid ? 'وضعیت: پرداخت شده' : 'وضعیت: پرداخت نشده'}
              </Text>
            </View>

            <Text style={styles.invoiceFooter}>از خرید شما سپاسگزاریم 🌿</Text>
            <Text style={styles.invoiceFooterSmall}>
              صادرشده با اپلیکیشن سودیار
            </Text>
          </View>
        </ViewShot>

        <Card>
          <Text style={styles.productName}>عملیات فاکتور</Text>
          <Button title="📤 ارسال تصویر فاکتور" onPress={shareInvoiceImage} />
          <Button title="🖼 ذخیره تصویر در گالری" secondary onPress={saveInvoiceImage} />
          <Button
            title="بازگشت به سوابق فاکتورها"
            secondary
            onPress={() => setPage('history')}
          />
        </Card>
      </>
    );
  };

  const renderCustomers = () => (
    <>
      <Header title="مشتریان" subtitle="ثبت و مدیریت مشتریان فروشگاه" />

      <Card>
        <Field label="نام مشتری" value={customerName} onChangeText={setCustomerName}
          numeric={false} placeholder="نام و نام خانوادگی" />
        <Field label="شماره تماس" value={customerPhone} onChangeText={setCustomerPhone}
          numeric={false} placeholder="شماره موبایل" />
        <Field label="یادداشت" value={customerNote} onChangeText={setCustomerNote}
          numeric={false} placeholder="توضیحات اختیاری" />
        <Button title="ثبت مشتری جدید" onPress={addCustomer} />
      </Card>

      <Text style={styles.sectionTitle}>
        فهرست مشتریان ({format(customers.length)})
      </Text>

      {customers.map(c => {
        const customerSales = sales.filter(x => x.customerId === c.id);
        const amount = customerSales.reduce(
          (s, x) => s + toNumber(x.totalAmount), 0
        );

        return (
          <Card key={c.id}>
            <Text style={styles.productName}>{c.name}</Text>
            <Text style={styles.muted}>{c.phone || 'شماره ثبت نشده'}</Text>
            {!!c.note && <Text style={styles.muted}>{c.note}</Text>}
            <Text style={styles.infoValue}>مجموع خرید: {format(amount)} تومان</Text>

            <Button title="حذف مشتری" danger onPress={() => Alert.alert(
              'حذف مشتری',
              'مشتری حذف شود؟ سوابق فاکتور باقی می‌مانند.',
              [
                { text: 'انصراف', style: 'cancel' },
                {
                  text: 'حذف',
                  style: 'destructive',
                  onPress: () => setCustomers(old => old.filter(x => x.id !== c.id)),
                },
              ]
            )} />
          </Card>
        );
      })}
    </>
  );

  const renderExpenses = () => (
    <>
      <Header title="هزینه‌ها" subtitle="هزینه‌های جانبی کسب‌وکارت را ثبت کن" />

      <Card>
        <Field label="عنوان هزینه" value={expenseTitle} onChangeText={setExpenseTitle}
          numeric={false} placeholder="مثلاً اجاره، اینترنت، تبلیغات..." />
        <Field label="مبلغ هزینه (تومان)" value={expenseAmount} onChangeText={setExpenseAmount} />
        <Field label="توضیحات" value={expenseNote} onChangeText={setExpenseNote}
          numeric={false} placeholder="توضیحات اختیاری" />
        <Button title="ثبت هزینه" onPress={addExpense} />
      </Card>

      <Text style={styles.sectionTitle}>
        مجموع هزینه‌ها: {format(totalExpenses)} تومان
      </Text>

      {expenses.map(x => (
        <Card key={x.id}>
          <Text style={styles.productName}>{x.title}</Text>
          <Text style={styles.muted}>{dateText(x.date)}</Text>
          <Text style={styles.infoValue}>{format(x.amount)} تومان</Text>
          {!!x.note && <Text style={styles.muted}>{x.note}</Text>}
          <Button
            title="حذف هزینه"
            danger
            onPress={() => setExpenses(old => old.filter(e => e.id !== x.id))}
          />
        </Card>
      ))}
    </>
  );

  const renderReports = () => (
    <>
      <Header title="گزارش مالی" subtitle="نمای کلی درآمد، سود و هزینه‌ها" />

      <Text style={styles.sectionTitle}>امروز</Text>
      <View style={styles.statsGrid}>
        <Stat title="فروش امروز" value={todayRevenue} />
        <Stat title="سود ناخالص امروز" value={todayProfit} />
        <Stat title="هزینه امروز" value={todayExpenses} />
        <Stat title="سود پس از هزینه‌ها" value={todayProfit - todayExpenses} />
      </View>

      <Text style={styles.sectionTitle}>ماه جاری</Text>
      <View style={styles.statsGrid}>
        <Stat title="فروش ماه" value={monthRevenue} />
        <Stat title="سود ناخالص ماه" value={monthProfit} />
        <Stat title="هزینه ماه" value={monthExpenses} />
        <Stat title="سود پس از هزینه‌ها" value={monthProfit - monthExpenses} />
      </View>

      <Text style={styles.sectionTitle}>از ابتدای استفاده</Text>
      <View style={styles.statsGrid}>
        <Stat title="کل فروش ثبت‌شده" value={totalRevenue} />
        <Stat title="کل سود ناخالص" value={totalProfit} />
        <Stat title="کل هزینه‌ها" value={totalExpenses} />
        <Stat title="سود پس از هزینه‌ها" value={totalProfit - totalExpenses} />
      </View>

      <Text style={styles.muted}>
        سود پس از هزینه‌ها از کم کردن هزینه‌های ثبت‌شده از سود فروش محاسبه شده است.
      </Text>
    </>
  );

  const renderHistory = () => (
    <>
      <Header title="سوابق فاکتورها" subtitle="فاکتورهای فروش و خرید ثبت‌شده" />

      <Text style={styles.sectionTitle}>فاکتورهای فروش</Text>

      {sales.length === 0
        ? <Card><Text style={styles.emptyText}>فروشی ثبت نشده.</Text></Card>
        : sales.map(x => (
          <Card key={x.id}>
            <Text style={styles.productName}>
              {x.customerName || x.productName || 'فروش'}
            </Text>
            <Text style={styles.muted}>شماره: {x.invoiceNumber || x.id}</Text>
            <Text style={styles.muted}>{dateText(x.date)}</Text>

            {getInvoiceItems(x).map((item, i) => (
              <Text key={i} style={styles.muted}>
                {item.productName} - {format(item.quantity)} عدد
              </Text>
            ))}

            <Text style={styles.infoValue}>
              فروش: {format(x.totalAmount)} تومان
            </Text>
            <Text style={styles.muted}>سود: {format(x.profit)} تومان</Text>
            <Text style={styles.muted}>
              وضعیت: {x.paymentStatus === 'unpaid' ? 'پرداخت نشده' : 'پرداخت شده'}
            </Text>

            <Button
              title="مشاهده و ارسال فاکتور"
              onPress={() => openInvoice(x)}
            />
          </Card>
        ))}

      <Text style={styles.sectionTitle}>فاکتورهای خرید</Text>

      {purchases.length === 0
        ? <Card><Text style={styles.emptyText}>خریدی ثبت نشده.</Text></Card>
        : purchases.map(x => (
          <Card key={x.id}>
            <Text style={styles.productName}>فاکتور خرید</Text>
            <Text style={styles.muted}>{dateText(x.date)}</Text>

            {(x.items || []).map((item, i) => (
              <Text key={i} style={styles.muted}>
                {item.productName} - {format(item.quantity)} عدد
              </Text>
            ))}

            <Text style={styles.infoValue}>
              جمع خرید: {format(x.totalAmount)} تومان
            </Text>
          </Card>
        ))}
    </>
  );

  const renderCalculator = () => <Calculator />;

  const renderBackup = () => (
    <>
      <Header title="پشتیبان‌گیری" subtitle="از اطلاعات فروشگاهت محافظت کن" />

      <Card>
        <Text style={styles.productName}>خروجی گرفتن از اطلاعات</Text>
        <Text style={styles.muted}>
          محصولات، فروش‌ها، خریدها، مشتریان، هزینه‌ها و تنظیمات فروشگاه
          در یک پشتیبان قرار می‌گیرند.
        </Text>
        <Button title="اشتراک‌گذاری پشتیبان" onPress={exportBackup} />
      </Card>

      <Card>
        <Text style={styles.productName}>بازیابی پشتیبان</Text>
        <Text style={styles.muted}>
          متن کامل فایل پشتیبان را اینجا جای‌گذاری کن. اطلاعات فعلی جایگزین می‌شوند.
        </Text>

        <TextInput
          style={[styles.input, styles.backupInput]}
          value={backupText}
          onChangeText={setBackupText}
          multiline
          textAlign="right"
          placeholder="متن JSON پشتیبان را اینجا وارد کن..."
          placeholderTextColor="#64748b"
        />

        <Button title="بازیابی اطلاعات" danger onPress={importBackup} />
      </Card>
    </>
  );

  const pages = {
    home: renderHome,
    products: renderProducts,
    productForm: renderProductForm,
    purchase: renderPurchase,
    sale: renderSale,
    invoiceDetail: renderInvoiceDetail,
    customers: renderCustomers,
    expenses: renderExpenses,
    reports: renderReports,
    history: renderHistory,
    backup: renderBackup,
    calculator: renderCalculator,
    storeSettings: renderStoreSettings,
  };

  if (!loaded) {
    return (
      <SafeAreaView style={styles.loading}>
        <StatusBar barStyle="light-content" backgroundColor="#071426" />
        <Text style={styles.loadingText}>در حال آماده‌سازی سودیار...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#071426" />

      <View style={styles.topBar}>
        <Text style={styles.logo}>سودیار</Text>
        <Text style={styles.version}>نسخه ۲.۲.۰</Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {pages[page] ? pages[page]() : renderHome()}
      </ScrollView>

      <View style={styles.bottomNav}>
        {[
          ['⌂', 'خانه', 'home'],
          ['▣', 'محصولات', 'products'],
          ['＋', 'فروش', 'sale'],
          ['▤', 'گزارش', 'reports'],
        ].map(([icon, title, target]) => (
          <TouchableOpacity
            key={target}
            style={styles.navItem}
            onPress={() => setPage(target)}
          >
            <Text style={styles.navIcon}>{icon}</Text>
            <Text style={[
              styles.navText,
              page === target && styles.navActive,
            ]}>
              {title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function InvoiceRow({ label, value }) {
  return (
    <View style={styles.invoiceSummaryRow}>
      <Text style={styles.invoiceSummaryLabel}>{label}</Text>
      <Text style={styles.invoiceSummaryValue}>{format(value)} تومان</Text>
    </View>
  );
}

function Calculator() {
  const [purchase, setPurchase] = useState('');
  const [shipping, setShipping] = useState('');
  const [packaging, setPackaging] = useState('');
  const [other, setOther] = useState('');
  const [sell, setSell] = useState('');

  const profit = toNumber(sell) - toNumber(purchase) -
    toNumber(shipping) - toNumber(packaging) - toNumber(other);

  const margin = toNumber(sell)
    ? profit / toNumber(sell) * 100
    : 0;

  return (
    <>
      <Header title="محاسبه سود" subtitle="سود هر محصول را سریع محاسبه کن" />

      <Card>
        <Field label="قیمت خرید" value={purchase} onChangeText={setPurchase} />
        <Field label="هزینه ارسال" value={shipping} onChangeText={setShipping} />
        <Field label="هزینه بسته‌بندی" value={packaging} onChangeText={setPackaging} />
        <Field label="سایر هزینه‌ها" value={other} onChangeText={setOther} />
        <Field label="قیمت فروش" value={sell} onChangeText={setSell} />

        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>سود هر عدد</Text>
          <Text style={[
            styles.resultValue,
            { color: profit >= 0 ? '#35d6bd' : '#fb7185' },
          ]}>
            {format(profit)} تومان
          </Text>

          <Text style={styles.resultLabel}>حاشیه سود</Text>
          <Text style={styles.resultValue}>{format(margin)}٪</Text>
        </View>

        <Button title="پاک کردن محاسبات" secondary onPress={() => {
          setPurchase('');
          setShipping('');
          setPackaging('');
          setOther('');
          setSell('');
        }} />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#071426' },

  loading: {
    flex: 1,
    backgroundColor: '#071426',
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: { color: '#fff', fontSize: 16 },

  topBar: {
    height: 58,
    paddingHorizontal: 20,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1e3048',
  },

  logo: { color: '#35d6bd', fontSize: 23, fontWeight: '900' },
  version: { color: '#8495aa', fontSize: 12 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 30 },
  header: { marginBottom: 18, alignItems: 'flex-end' },

  headerTitle: {
    color: '#fff',
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'right',
  },

  headerSubtitle: {
    color: '#91a4ba',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'right',
  },

  welcomeBox: {
    backgroundColor: '#10334a',
    borderWidth: 1,
    borderColor: '#1b5264',
    padding: 18,
    borderRadius: 18,
    marginBottom: 22,
  },

  welcomeTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'right',
  },

  welcomeText: {
    color: '#a7c4d1',
    fontSize: 13,
    marginTop: 7,
    textAlign: 'right',
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
    marginTop: 18,
    marginBottom: 12,
  },

  statsGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  statCard: {
    width: '48%',
    minHeight: 105,
    justifyContent: 'center',
  },

  card: {
    backgroundColor: '#102139',
    borderColor: '#203752',
    borderWidth: 1,
    borderRadius: 17,
    padding: 16,
    marginBottom: 12,
  },

  statTitle: {
    color: '#9db0c5',
    fontSize: 12,
    textAlign: 'right',
  },

  statValue: {
    color: '#35d6bd',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'right',
    marginTop: 9,
  },

  statUnit: {
    color: '#8195aa',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 3,
  },

  menuGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  menuItem: {
    width: '48%',
    backgroundColor: '#102139',
    borderWidth: 1,
    borderColor: '#203752',
    borderRadius: 17,
    padding: 15,
    marginBottom: 12,
    minHeight: 100,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  menuIcon: { fontSize: 25, marginBottom: 9 },

  menuTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'right',
  },

  fieldWrap: { marginBottom: 14 },

  fieldLabel: {
    color: '#c5d3e1',
    fontSize: 13,
    textAlign: 'right',
    marginBottom: 8,
  },

  input: {
    backgroundColor: '#09182b',
    borderWidth: 1,
    borderColor: '#2a405a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#fff',
    fontSize: 15,
    minHeight: 49,
  },

  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },

  backupInput: {
    minHeight: 150,
    textAlignVertical: 'top',
    marginTop: 12,
  },

  button: {
    backgroundColor: '#19b99e',
    paddingVertical: 15,
    borderRadius: 13,
    alignItems: 'center',
    marginTop: 8,
  },

  buttonText: {
    color: '#061b25',
    fontSize: 15,
    fontWeight: '900',
  },

  secondaryButton: {
    backgroundColor: '#1c3048',
    borderWidth: 1,
    borderColor: '#36516d',
  },

  secondaryButtonText: { color: '#d4e2ef' },
  dangerButton: { backgroundColor: '#482536' },
  dangerButtonText: { color: '#ff9bad' },

  resultBox: {
    backgroundColor: '#0a1b2d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#24435a',
    padding: 16,
    marginTop: 5,
    marginBottom: 14,
  },

  resultLabel: {
    color: '#a4b8ca',
    fontSize: 13,
    textAlign: 'right',
    marginTop: 4,
  },

  resultValue: {
    color: '#35d6bd',
    fontSize: 23,
    fontWeight: '900',
    textAlign: 'right',
    marginTop: 7,
    marginBottom: 10,
  },

  productName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },

  muted: {
    color: '#91a4ba',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 7,
  },

  infoRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },

  infoLabel: {
    color: '#91a4ba',
    fontSize: 12,
    textAlign: 'right',
    flex: 1,
  },

  infoValue: {
    color: '#e5edf5',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'left',
    flex: 1,
    marginTop: 8,
  },

  actionRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginTop: 15,
  },

  smallButton: {
    backgroundColor: '#1b3850',
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 10,
    marginLeft: 7,
  },

  smallButtonText: {
    color: '#d7e8f4',
    fontSize: 12,
    fontWeight: '800',
  },

  deleteButton: { backgroundColor: '#482536' },
  deleteText: { color: '#fb7185', fontWeight: '800' },

  emptyText: {
    color: '#a8bacd',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 25,
    marginVertical: 10,
  },

  selectRow: {
    backgroundColor: '#0a1b2d',
    borderWidth: 1,
    borderColor: '#29435e',
    borderRadius: 11,
    padding: 12,
    marginTop: 7,
    color: '#dce8f2',
    textAlign: 'right',
  },

  selected: {
    borderColor: '#35d6bd',
    backgroundColor: '#123347',
  },

  statusRow: {
    flexDirection: 'row-reverse',
    marginTop: 8,
    gap: 8,
  },

  statusOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#29435e',
    borderRadius: 11,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#0a1b2d',
  },

  statusSelected: {
    borderColor: '#35d6bd',
    backgroundColor: '#123347',
  },

  statusText: {
    color: '#e5edf5',
    fontSize: 13,
    fontWeight: '700',
  },

  divider: {
    height: 1,
    backgroundColor: '#29435e',
    marginVertical: 14,
  },

  invoicePaper: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 14,
  },

  invoiceTop: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },

  invoiceBrand: {
    color: '#087e70',
    fontSize: 25,
    fontWeight: '900',
  },

  invoiceTag: {
    color: '#172b3c',
    fontSize: 17,
    fontWeight: '800',
  },

  invoiceLine: {
    height: 1,
    backgroundColor: '#d5e1e8',
    marginVertical: 12,
  },

  invoiceSeller: {
    backgroundColor: '#f2f7f8',
    borderRadius: 9,
    padding: 12,
    marginVertical: 10,
  },

  invoiceNumber: {
    color: '#24394a',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    marginTop: 4,
  },

  invoiceDate: {
    color: '#526778',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 7,
  },

  invoiceCustomer: {
    backgroundColor: '#f2f7f8',
    borderRadius: 9,
    padding: 12,
    marginVertical: 14,
  },

  invoiceSection: {
    color: '#087e70',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
    marginVertical: 9,
  },

  invoiceText: {
    color: '#263d4d',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
  },

  invoiceTableHead: {
    flexDirection: 'row-reverse',
    backgroundColor: '#eaf2f4',
    padding: 9,
    borderRadius: 6,
  },

  invoiceTableRow: {
    flexDirection: 'row-reverse',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#e6edf0',
  },

  invoiceCell: {
    flex: 1,
    color: '#24394a',
    fontSize: 11,
    textAlign: 'right',
    paddingHorizontal: 3,
  },

  invoiceSummaryRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginVertical: 6,
  },

  invoiceSummaryLabel: {
    color: '#526778',
    fontSize: 12,
  },

  invoiceSummaryValue: {
    color: '#263d4d',
    fontSize: 12,
    fontWeight: '700',
  },

  invoiceTotal: {
    backgroundColor: '#e7f6f3',
    borderRadius: 8,
    padding: 13,
    marginTop: 12,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },

  invoiceTotalLabel: {
    color: '#087e70',
    fontSize: 14,
    fontWeight: '900',
  },

  invoiceTotalValue: {
    color: '#087e70',
    fontSize: 15,
    fontWeight: '900',
  },

  paymentBadge: {
    backgroundColor: '#dff5e9',
    borderRadius: 7,
    padding: 9,
    marginTop: 12,
    alignItems: 'center',
  },

  unpaidBadge: { backgroundColor: '#fff0dc' },

  paymentText: {
    color: '#176b4b',
    fontSize: 12,
    fontWeight: '800',
  },

  invoiceFooter: {
    color: '#087e70',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 18,
  },

  invoiceFooterSmall: {
    color: '#80919b',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
  },

  bottomNav: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#0b1b30',
    borderTopWidth: 1,
    borderTopColor: '#203752',
    paddingTop: 9,
    paddingBottom: 10,
  },

  navItem: { alignItems: 'center', flex: 1 },
  navIcon: { color: '#8fa5bb', fontSize: 21 },
  navText: { color: '#8fa5bb', fontSize: 10, marginTop: 4 },
  navActive: { color: '#35d6bd', fontWeight: '900' },
});