type ProfitInvoice = {
  subtotal: number;
  discount: number;
  taxAmount: number;
  items: Array<{
    itemType: string;
    quantity: number;
    total: number;
    costPrice: number;
  }>;
};

type ProfitReturn = {
  subtotal: number;
  discount: number;
  taxAmount: number;
  profitBasis: string;
  items: Array<{
    quantity: number;
    costPrice: number;
    costPriceIsEstimated: boolean;
  }>;
};

const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export const calculateProfitTotals = (input: {
  invoices: ProfitInvoice[];
  returns: ProfitReturn[];
  commissions: Array<{ amount: number }>;
  expenses: Array<{ amount: number }>;
  revenues: Array<{ amount: number }>;
}) => {
  let partsSales = 0;
  let partsCost = 0;
  let laborSales = 0;
  for (const invoice of input.invoices) {
    const partsGross = invoice.items
      .filter((item) => item.itemType === 'PART')
      .reduce((sum, item) => sum + item.total, 0);
    const laborGross = invoice.items
      .filter((item) => item.itemType !== 'PART')
      .reduce((sum, item) => sum + item.total, 0);
    const costBase = invoice.subtotal > 0 ? invoice.subtotal : partsGross + laborGross;
    const partsRatio = costBase > 0 ? partsGross / costBase : 0;
    const laborRatio = costBase > 0 ? laborGross / costBase : 0;
    partsSales += partsGross - (invoice.discount + invoice.taxAmount) * partsRatio;
    laborSales += laborGross - (invoice.discount + invoice.taxAmount) * laborRatio;
    partsCost += invoice.items
      .filter((item) => item.itemType === 'PART')
      .reduce((sum, item) => sum + item.costPrice * item.quantity, 0);
  }

  let returnedSales = 0;
  let returnedPartsCost = 0;
  for (const salesReturn of input.returns) {
    returnedSales += salesReturn.subtotal - salesReturn.discount - salesReturn.taxAmount;
    returnedPartsCost += salesReturn.items
      .reduce((sum, item) => sum + item.costPrice * item.quantity, 0);
  }
  partsSales -= returnedSales;
  partsCost -= returnedPartsCost;

  const commissions = input.commissions.reduce((sum, row) => sum + row.amount, 0);
  const expenses = input.expenses.reduce((sum, row) => sum + row.amount, 0);
  const revenues = input.revenues.reduce((sum, row) => sum + row.amount, 0);
  const partsProfit = partsSales - partsCost;
  const laborProfit = laborSales - commissions;
  const totalIncome = partsSales + laborSales + revenues;
  const grossProfit = totalIncome - partsCost - commissions;
  const netProfit = grossProfit - expenses;
  const historicalReturnEstimate = input.returns.some((salesReturn) =>
    salesReturn.profitBasis !== 'ORIGINAL_INVOICE'
    || salesReturn.items.some((item) => item.costPriceIsEstimated));

  return {
    totalIncome: roundMoney(totalIncome),
    parts: {
      sales: roundMoney(partsSales),
      cost: roundMoney(partsCost),
      profit: roundMoney(partsProfit),
      margin: partsSales > 0 ? Math.round((partsProfit / partsSales) * 1000) / 10 : 0,
    },
    workshop: {
      laborSales: roundMoney(laborSales),
      technicianCost: roundMoney(commissions),
      profit: roundMoney(laborProfit),
    },
    expenses: roundMoney(expenses),
    revenues: roundMoney(revenues),
    returnedSales: roundMoney(returnedSales),
    returnedPartsCost: roundMoney(returnedPartsCost),
    grossProfit: roundMoney(grossProfit),
    netProfit: roundMoney(netProfit),
    profitMargin: totalIncome > 0 ? Math.round((netProfit / totalIncome) * 1000) / 10 : 0,
    historicalReturnEstimate,
  };
};
