"use client"

import type React from "react"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Loader2, AlertTriangle, CheckCircle, Settings, Plus, X } from "lucide-react"
import { format, parse } from "date-fns"
import { useGoogleSheet, parseGvizDate } from "@/lib/g-sheets"

// Shadcn UI components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

// --- Type Definitions ---
interface ProductionItem {
  _rowIndex: number
  timestamp: string // Changed from jobCardNo to timestamp
  firmName: string
  deliveryOrderNo: string
  partyName: string
  productName: string
  producedQuantity: number
  expectedDeliveryDate: string
  priority: string
  note: string
  verificationTimestamp: string
}

interface KycProduct {
  productName: string
  alumina: number
  iron: number
  price: number
  bd: number
  ap: number
}

interface KittingFormRow {
  id: number
  productName: string
  percentage: string
  // Base values from KYC
  baseAlumina: number
  baseIron: number
  basePrice: number
  baseBd: number
  baseAp: number
  // Calculated values
  al: number
  fe: number
  bd: number
  ap: number
  price: number
}

// --- Constants ---
const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwpDkP_Wmk8udmH6XsWPvpXgj-e3rGNxNJlOdAVXEWiCJWh3LI8CjIH4oJW5k5pjKFCvg/exec"
const SHEET_ID = "1niKq7rnnWdkH5gWXJIiVJQEsUKgK8qdjLokbo0rmt48"
const PRODUCTION_SHEET = "Production"
const KYC_SHEET = "KYC"
const COSTING_RESPONSE_SHEET = "Costing Response"

// --- Column Definitions ---
const FULL_KITTING_COLUMNS = {
  verificationTimestamp: 22, // Col V
}

const PENDING_COLUMNS_META = [
  { header: "Action", dataKey: "actionColumn", alwaysVisible: true, toggleable: false },
  { header: "Firm Name", dataKey: "firmName", toggleable: true },
  { header: "Delivery Order No.", dataKey: "deliveryOrderNo", toggleable: true },
  { header: "Party Name", dataKey: "partyName", toggleable: true },
  { header: "Product Name", dataKey: "productName", toggleable: true },
  { header: "Produced Quantity", dataKey: "producedQuantity", toggleable: true },
]

const HISTORY_COLUMNS_META = [
  { header: "Firm Name", dataKey: "firmName", toggleable: true },
  { header: "Delivery Order No.", dataKey: "deliveryOrderNo", toggleable: true },
  { header: "Party Name", dataKey: "partyName", toggleable: true },
  { header: "Product Name", dataKey: "productName", toggleable: true },
  { header: "Produced Quantity", dataKey: "producedQuantity", toggleable: true },
  { header: "Expected Delivery Date", dataKey: "expectedDeliveryDate", toggleable: true },
  { header: "Priority", dataKey: "priority", toggleable: true },
  { header: "Note", dataKey: "note", toggleable: true },
  { header: "Verified At", dataKey: "verificationTimestamp", toggleable: true },
]

export default function CheckPage() {
  const [pendingChecks, setPendingChecks] = useState<ProductionItem[]>([])
  const [historyChecks, setHistoryChecks] = useState<ProductionItem[]>([])
  const [kycProducts, setKycProducts] = useState<KycProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Dialog and Form State
  const [isKittingDialogOpen, setIsKittingDialogOpen] = useState(false)
  const [selectedCheck, setSelectedCheck] = useState<ProductionItem | null>(null)
  const [kittingFormRows, setKittingFormRows] = useState<KittingFormRow[]>([])
  const [manufacturingCost, setManufacturingCost] = useState("0")
  const [interestDays, setInterestDays] = useState("0")
  const [transporting, setTransporting] = useState("0")
  const [sellingPriceInput, setSellingPriceInput] = useState("")

  const [activeTab, setActiveTab] = useState("pending")
  const [visiblePendingColumns, setVisiblePendingColumns] = useState<Record<string, boolean>>({})
  const [visibleHistoryColumns, setVisibleHistoryColumns] = useState<Record<string, boolean>>({})

  const { fetchData: fetchProductionSheetData } = useGoogleSheet(PRODUCTION_SHEET, SHEET_ID)
  const { fetchData: fetchKycSheetData } = useGoogleSheet(KYC_SHEET, SHEET_ID)
  const { fetchData: fetchCostingResponseData } = useGoogleSheet(COSTING_RESPONSE_SHEET, SHEET_ID)

  const processGvizTable = (table: any) => {
    if (!table || !table.rows) return []
    return table.rows.map((row: any, index: number) => {
      const rowData: { [key: string]: any } = { _rowIndex: index + 2 }
      ;(row.c || []).forEach((cell: any, cellIndex: number) => {
        rowData[`col${cellIndex}`] = cell ? (cell.f ?? cell.v) : null
      })
      return rowData
    })
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [productionTable, kycTable] = await Promise.all([fetchProductionSheetData(), fetchKycSheetData()])

      const allRows = processGvizTable(productionTable)
      // **FIX**: Filter out potential header rows before processing
      const dataRows = allRows.filter((row) => row.col0 !== "Timestamp" && row.col0 !== null)

      const pending = dataRows
        .filter((row: any) => row.col20 != null && row.col21 == null)
        .map(
          (row: any): ProductionItem => ({
            _rowIndex: row._rowIndex,
            timestamp: String(row.col0 || ""), // Changed from jobCardNo to timestamp
            deliveryOrderNo: String(row.col1 || ""),
            firmName: String(row.col2 || ""),
            partyName: String(row.col3 || ""),
            productName: String(row.col4 || ""),
            producedQuantity: Number(row.col5 || 0),
            expectedDeliveryDate: "",
            priority: "",
            note: "",
            verificationTimestamp: "",
          }),
        )

      const history = dataRows
        .filter((row: any) => row.col20 != null && row.col21 != null)
        .map((row: any): ProductionItem => {
          let expectedDateStr = String(row.col6 || "")
          if (expectedDateStr) {
            try {
              const parsed = parseGvizDate(expectedDateStr)
              if (parsed) expectedDateStr = format(parsed, "dd/MM/yyyy")
            } catch (e) {
              /* keep original if parsing fails */
            }
          }

          const verifiedTimestampStr = String(row.col21 || "")
          return {
            _rowIndex: row._rowIndex,
            timestamp: String(row.col0 || ""), // Changed from jobCardNo to timestamp
            deliveryOrderNo: String(row.col1 || ""),
            firmName: String(row.col2 || ""),
            partyName: String(row.col3 || ""),
            productName: String(row.col4 || ""),
            producedQuantity: Number(row.col5 || 0),
            expectedDeliveryDate: expectedDateStr,
            priority: String(row.col7 || ""),
            note: String(row.col8 || ""),
            verificationTimestamp: verifiedTimestampStr,
          }
        })
        .sort((a, b) => {
          try {
            const dateA = parse(a.verificationTimestamp, "dd/MM/yyyy HH:mm:ss", new Date())
            const dateB = parse(b.verificationTimestamp, "dd/MM/yyyy HH:mm:ss", new Date())
            if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
              return dateB.getTime() - dateA.getTime()
            }
          } catch (e) {
            /* fallback to string sort */
          }
          return b.verificationTimestamp.localeCompare(a.verificationTimestamp)
        })

      const products = processGvizTable(kycTable).map(
        (row: any): KycProduct => ({
          productName: String(row.col0 || ""),
          alumina: Number(row.col1 || 0),
          iron: Number(row.col2 || 0),
          price: Number(row.col3 || 0),
          bd: Number(row.col4 || 0),
          ap: Number(row.col5 || 0),
        }),
      )

      setPendingChecks(pending)
      setHistoryChecks(history)
      setKycProducts(products.filter((p) => p.productName))
    } catch (err: any) {
      setError(`Failed to load data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [fetchProductionSheetData, fetchKycSheetData])

  useEffect(() => {
    const initializeVisibility = (columnsMeta: any[]) =>
      columnsMeta.reduce((acc, col) => ({ ...acc, [col.dataKey]: col.alwaysVisible !== false }), {})

    setVisiblePendingColumns(initializeVisibility(PENDING_COLUMNS_META))
    setVisibleHistoryColumns(initializeVisibility(HISTORY_COLUMNS_META))
    loadData()
  }, [loadData])

  // --- Full Kitting Form Logic ---
  const resetKittingForm = () => {
    setKittingFormRows([
      {
        id: 1,
        productName: "",
        percentage: "",
        baseAlumina: 0,
        baseIron: 0,
        basePrice: 0,
        baseBd: 0,
        baseAp: 0,
        al: 0,
        fe: 0,
        bd: 0,
        ap: 0,
        price: 0,
      },
    ])
    setManufacturingCost("0")
    setInterestDays("0")
    setTransporting("0")
    setSellingPriceInput("")
  }

  const handleOpenKittingForm = (item: ProductionItem) => {
    setSelectedCheck(item)
    resetKittingForm()
    setIsKittingDialogOpen(true)
  }

  const addKittingFormRow = () => {
    if (kittingFormRows.length < 20) {
      setKittingFormRows([
        ...kittingFormRows,
        {
          id: (kittingFormRows[kittingFormRows.length - 1]?.id || 0) + 1,
          productName: "",
          percentage: "",
          baseAlumina: 0,
          baseIron: 0,
          basePrice: 0,
          baseBd: 0,
          baseAp: 0,
          al: 0,
          fe: 0,
          bd: 0,
          ap: 0,
          price: 0,
        },
      ])
    }
  }

  const removeKittingFormRow = (id: number) => {
    if (kittingFormRows.length > 1) {
      setKittingFormRows(kittingFormRows.filter((row) => row.id !== id))
    }
  }

  const handleKittingRowChange = (id: number, field: keyof KittingFormRow, value: any) => {
    const newRows = kittingFormRows.map((row) => {
      if (row.id === id) {
        const updatedRow = { ...row, [field]: value }
        if (field === "productName") {
          const productData = kycProducts.find((p) => p.productName === value)
          if (productData) {
            updatedRow.baseAlumina = productData.alumina
            updatedRow.baseIron = productData.iron
            updatedRow.basePrice = productData.price
            updatedRow.baseBd = productData.bd
            updatedRow.baseAp = productData.ap
          }
        }
        const percentage = Number.parseFloat(updatedRow.percentage) || 0
        updatedRow.al = (updatedRow.baseAlumina * percentage) / 100
        updatedRow.fe = (updatedRow.baseIron * percentage) / 100
        updatedRow.price = (updatedRow.basePrice * percentage) / 100
        updatedRow.bd = (updatedRow.baseBd * percentage) / 100
        updatedRow.ap = (updatedRow.baseAp * percentage) / 100
        return updatedRow
      }
      return row
    })
    setKittingFormRows(newRows)
  }

  const kittingTotals = useMemo(() => {
    return kittingFormRows.reduce(
      (acc, row) => {
        acc.al += row.al
        acc.fe += row.fe
        acc.bd += row.bd
        acc.ap += row.ap
        acc.price += row.price
        acc.percentage += Number.parseFloat(row.percentage) || 0
        return acc
      },
      { al: 0, fe: 0, bd: 0, ap: 0, price: 0, percentage: 0 },
    )
  }, [kittingFormRows])

  const interestAmount = useMemo(() => {
    return (kittingTotals.price * 0.18 * (Number.parseFloat(interestDays) || 0)) / 365
  }, [kittingTotals.price, interestDays])

  const totalCost = useMemo(() => {
    return (
      kittingTotals.price +
      (Number.parseFloat(manufacturingCost) || 0) +
      interestAmount +
      (Number.parseFloat(transporting) || 0)
    )
  }, [kittingTotals.price, manufacturingCost, interestAmount, transporting])

  const sellingPrice = useMemo(() => {
    if (sellingPriceInput) return Number.parseFloat(sellingPriceInput)
    return totalCost > 0 ? totalCost / 0.75 : 0
  }, [totalCost, sellingPriceInput])

  const variableCost = useMemo(() => kittingTotals.price, [kittingTotals.price])

  const gpPercentage = useMemo(() => {
    return sellingPrice > 0 ? ((sellingPrice - variableCost) / sellingPrice) * 100 : 0
  }, [sellingPrice, variableCost])

  const generateCompositionNumber = async (): Promise<string> => {
    const table = await fetchCostingResponseData()
    const rows = processGvizTable(table)
    let maxNumber = 0
    rows.forEach((row) => {
      const cn = row.col1
      if (cn && typeof cn === "string" && cn.startsWith("CN-")) {
        const num = Number.parseInt(cn.substring(3))
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num
        }
      }
    })
    return `CN-${String(maxNumber + 1).padStart(3, "0")}`
  }

  const handleSaveKittingForm = async () => {
    if (!selectedCheck) return
    setIsSubmitting(true)
    try {
      const submissionDate = new Date()
      const compositionNumber = await generateCompositionNumber()

      const rmNames = kittingFormRows.map((r) => r.productName)
      const rmQtys = kittingFormRows.map((r) => r.percentage)
      const paddedRmNames = [...rmNames, ...Array(20 - rmNames.length).fill("")]
      const paddedRmQtys = [...rmQtys, ...Array(20 - rmQtys.length).fill("")]

      const rowData = [
        format(submissionDate, "dd/MM/yyyy HH:mm:ss"),
        compositionNumber,
        selectedCheck.deliveryOrderNo,
        selectedCheck.productName,
        variableCost.toFixed(2),
        manufacturingCost,
        interestDays,
        interestAmount.toFixed(2),
        transporting,
        sellingPrice.toFixed(2),
        gpPercentage.toFixed(2) + "%",
        kittingTotals.al.toFixed(4),
        kittingTotals.fe.toFixed(4),
        kittingTotals.bd.toFixed(4),
        kittingTotals.ap.toFixed(4),
        ...paddedRmNames,
        ...paddedRmQtys,
      ]

      const costingBody = new URLSearchParams({
        sheetName: COSTING_RESPONSE_SHEET,
        action: "insert",
        rowData: JSON.stringify(rowData),
      })

      const costingRes = await fetch(WEB_APP_URL, { method: "POST", body: costingBody })
      const costingResult = await costingRes.json()
      if (!costingResult.success) throw new Error(costingResult.error || "Failed to save to Costing Response sheet.")

      // **FIX**: Use updateColumns with rowIndex instead of updateByJobCard
      const productionUpdateBody = new URLSearchParams({
        sheetName: PRODUCTION_SHEET,
        action: "updateColumns",
        rowIndex: selectedCheck._rowIndex.toString(),
        columnUpdates: JSON.stringify({
          [FULL_KITTING_COLUMNS.verificationTimestamp]: format(submissionDate, "dd/MM/yyyy HH:mm:ss"),
        }),
      })

      const productionRes = await fetch(WEB_APP_URL, { method: "POST", body: productionUpdateBody })
      const productionResult = await productionRes.json()
      if (!productionResult.success) throw new Error(productionResult.error || "Failed to update Production sheet.")

      alert("Full Kitting data submitted and production status updated successfully!")
      setIsKittingDialogOpen(false)
      await loadData()
    } catch (err: any) {
      setError(err.message)
      alert(`Error: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- Column Toggling Logic ---
  const handleToggleColumn = (tab: "pending" | "history", dataKey: string, checked: boolean) => {
    const setter = tab === "pending" ? setVisiblePendingColumns : setVisibleHistoryColumns
    setter((prev) => ({ ...prev, [dataKey]: checked }))
  }

  const handleSelectAllColumns = (tab: "pending" | "history", columnsMeta: any[], checked: boolean) => {
    const newVisibility = columnsMeta.reduce(
      (acc, col) => {
        if (col.toggleable) acc[col.dataKey] = checked
        return acc
      },
      {} as Record<string, boolean>,
    )
    const setter = tab === "pending" ? setVisiblePendingColumns : setVisibleHistoryColumns
    setter((prev) => ({ ...prev, ...newVisibility }))
  }

  const visiblePendingColumnsMeta = useMemo(
    () => PENDING_COLUMNS_META.filter((c) => visiblePendingColumns[c.dataKey]),
    [visiblePendingColumns],
  )
  const visibleHistoryColumnsMeta = useMemo(
    () => HISTORY_COLUMNS_META.filter((c) => visibleHistoryColumns[c.dataKey]),
    [visibleHistoryColumns],
  )

  // --- Render Logic ---
  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
      </div>
    )
  if (error)
    return (
      <div className="p-8 text-center text-red-600 bg-red-50 rounded-md">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
        <p className="text-lg font-semibold">Error Loading Data</p>
        <p>{error}</p>
        <Button onClick={loadData} className="mt-4 bg-purple-600 text-white hover:bg-purple-700">
          Retry
        </Button>
      </div>
    )

  return (
    <div className="space-y-6 p-4 md:p-6 bg-white min-h-screen">
      <Card className="shadow-md border-none">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-gray-800">
            <CheckCircle className="h-6 w-6 text-purple-600" />
            Full Kitting Verification
          </CardTitle>
          <CardDescription>Verify items after the full kitting process.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full sm:w-[450px] grid-cols-2 mb-6">
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> Pending Checks{" "}
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0.5 text-xs">
                  {pendingChecks.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> History{" "}
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0.5 text-xs">
                  {historyChecks.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <Card>
                <CardHeader className="py-3 px-4 bg-muted/30">
                  <div className="flex justify-between items-center bg-purple-50 rounded-md p-2">
                    <CardTitle>Pending Items</CardTitle>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs bg-transparent">
                          <Settings className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-56">
                        <div className="space-y-2 mb-4">
                          <h4 className="font-medium leading-none">Toggle Columns</h4>
                        </div>
                        <div className="flex justify-between">
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 h-auto"
                            onClick={() => handleSelectAllColumns("pending", PENDING_COLUMNS_META, true)}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 h-auto"
                            onClick={() => handleSelectAllColumns("pending", PENDING_COLUMNS_META, false)}
                          >
                            Deselect All
                          </Button>
                        </div>
                        <hr className="my-2" />
                        {PENDING_COLUMNS_META.filter((c) => c.toggleable).map((col) => (
                          <div key={col.dataKey} className="flex items-center space-x-2 my-1">
                            <Checkbox
                              id={`toggle-pending-${col.dataKey}`}
                              checked={visiblePendingColumns[col.dataKey]}
                              onCheckedChange={(checked) => handleToggleColumn("pending", col.dataKey, !!checked)}
                            />
                            <Label htmlFor={`toggle-pending-${col.dataKey}`} className="font-normal">
                              {col.header}
                            </Label>
                          </div>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="relative max-h-[600px] overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-slate-100">
                        <TableRow>
                          {visiblePendingColumnsMeta.map((c) => (
                            <TableHead key={c.dataKey}>{c.header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingChecks.length > 0 ? (
                          pendingChecks.map((item) => (
                            <TableRow key={item._rowIndex}>
                              {visiblePendingColumnsMeta.map((col) => (
                                <TableCell key={col.dataKey}>
                                  {col.dataKey === "actionColumn" ? (
                                    <Button size="sm" onClick={() => handleOpenKittingForm(item)} className="bg-purple-600 text-white hover:bg-purple-700">
                                      <CheckCircle className="mr-2 h-4 w-4" /> Verify
                                    </Button>
                                  ) : (
                                    (item[col.dataKey as keyof ProductionItem] as React.ReactNode)
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={visiblePendingColumnsMeta.length} className="h-24 text-center">
                              No pending items.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>History Items</CardTitle>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Settings className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-56">
                        <div className="space-y-2 mb-4">
                          <h4 className="font-medium leading-none">Toggle Columns</h4>
                        </div>
                        <div className="flex justify-between">
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 h-auto"
                            onClick={() => handleSelectAllColumns("history", HISTORY_COLUMNS_META, true)}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 h-auto"
                            onClick={() => handleSelectAllColumns("history", HISTORY_COLUMNS_META, false)}
                          >
                            Deselect All
                          </Button>
                        </div>
                        <hr className="my-2" />
                        {HISTORY_COLUMNS_META.filter((c) => c.toggleable).map((col) => (
                          <div key={col.dataKey} className="flex items-center space-x-2 my-1">
                            <Checkbox
                              id={`toggle-history-${col.dataKey}`}
                              checked={visibleHistoryColumns[col.dataKey]}
                              onCheckedChange={(checked) => handleToggleColumn("history", col.dataKey, !!checked)}
                            />
                            <Label htmlFor={`toggle-history-${col.dataKey}`} className="font-normal">
                              {col.header}
                            </Label>
                          </div>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="relative max-h-[600px] overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-slate-100">
                        <TableRow>
                          {visibleHistoryColumnsMeta.map((c) => (
                            <TableHead key={c.dataKey}>{c.header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyChecks.length > 0 ? (
                          historyChecks.map((item) => (
                            <TableRow key={item._rowIndex}>
                              {visibleHistoryColumnsMeta.map((col) => (
                                <TableCell key={col.dataKey}>
                                  {item[col.dataKey as keyof ProductionItem] as React.ReactNode}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={visibleHistoryColumnsMeta.length} className="h-24 text-center">
                              No history items.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Full Kitting Dialog */}
      <Dialog open={isKittingDialogOpen} onOpenChange={setIsKittingDialogOpen}>
        <DialogContent className="max-w-7xl w-full">
          <DialogHeader>
            <DialogTitle>Full Kitting Details</DialogTitle>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto p-1">
            <div className="grid grid-cols-2 gap-4 mb-4 px-4">
              <div>
                <Label htmlFor="doNumber">Delivery Order Number</Label>
                <Input id="doNumber" value={selectedCheck?.deliveryOrderNo || ""} readOnly />
              </div>
              <div>
                <Label htmlFor="productName">Product Name</Label>
                <Input id="productName" value={selectedCheck?.productName || ""} readOnly />
              </div>
            </div>

            <div className="flex justify-end mb-2 px-4">
              <Button onClick={addKittingFormRow} disabled={kittingFormRows.length >= 20} className="bg-purple-600 text-white hover:bg-purple-700">
                <Plus className="h-4 w-4 mr-2" /> Add Row
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px] p-2">Sl no</TableHead>
                    <TableHead className="w-[200px] p-2">Particulars</TableHead>
                    <TableHead className="p-2">AL</TableHead>
                    <TableHead className="p-2">FE</TableHead>
                    <TableHead className="p-2">BD</TableHead>
                    <TableHead className="p-2">AP</TableHead>
                    <TableHead className="p-2">Price</TableHead>
                    <TableHead className="bg-yellow-100 w-[100px] p-2">%</TableHead>
                    <TableHead className="p-2">AL</TableHead>
                    <TableHead className="p-2">FE</TableHead>
                    <TableHead className="p-2">BD</TableHead>
                    <TableHead className="p-2">AP</TableHead>
                    <TableHead className="p-2">Price</TableHead>
                    <TableHead className="p-2">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kittingFormRows.map((row, index) => (
                    <TableRow key={row.id}>
                      <TableCell className="p-2">{index + 1}</TableCell>
                      <TableCell className="p-2">
                        <Select
                          onValueChange={(value) => handleKittingRowChange(row.id, "productName", value)}
                          value={row.productName}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select mat" />
                          </SelectTrigger>
                          <SelectContent>
                            {kycProducts.map((p) => (
                              <SelectItem key={p.productName} value={p.productName}>
                                {p.productName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="p-2">{row.baseAlumina.toFixed(2)}</TableCell>
                      <TableCell className="p-2">{row.baseIron.toFixed(2)}</TableCell>
                      <TableCell className="p-2">{row.baseBd.toFixed(2)}</TableCell>
                      <TableCell className="p-2">{row.baseAp.toFixed(2)}</TableCell>
                      <TableCell className="p-2">{row.basePrice.toFixed(2)}</TableCell>
                      <TableCell className="bg-yellow-100 p-2">
                        <Input
                          type="number"
                          value={row.percentage}
                          onChange={(e) => handleKittingRowChange(row.id, "percentage", e.target.value)}
                          placeholder="Enter %"
                        />
                      </TableCell>
                      <TableCell className="p-2">{row.al.toFixed(4)}</TableCell>
                      <TableCell className="p-2">{row.fe.toFixed(4)}</TableCell>
                      <TableCell className="p-2">{row.bd.toFixed(4)}</TableCell>
                      <TableCell className="p-2">{row.ap.toFixed(4)}</TableCell>
                      <TableCell className="p-2">{row.price.toFixed(2)}</TableCell>
                      <TableCell className="p-2">
                        <Button variant="ghost" size="icon" onClick={() => removeKittingFormRow(row.id)}>
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={7} className="text-right font-medium p-2">
                      Manufacturing Cost
                    </TableCell>
                    <TableCell colSpan={5} className="p-2"></TableCell>
                    <TableCell className="p-2">
                      <Input
                        type="number"
                        value={manufacturingCost}
                        onChange={(e) => setManufacturingCost(e.target.value)}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={7} className="text-right font-medium p-2">
                      interest (days)
                    </TableCell>
                    <TableCell className="bg-yellow-100 p-2">
                      <Input type="number" value={interestDays} onChange={(e) => setInterestDays(e.target.value)} />
                    </TableCell>
                    <TableCell colSpan={4} className="p-2"></TableCell>
                    <TableCell className="p-2">
                      <Input value={interestAmount.toFixed(2)} readOnly />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={7} className="text-right font-medium p-2">
                      transporting (FOR)
                    </TableCell>
                    <TableCell colSpan={6} className="p-2">
                      <Input type="number" value={transporting} onChange={(e) => setTransporting(e.target.value)} />
                    </TableCell>
                  </TableRow>
                  <TableRow className="font-bold">
                    <TableCell colSpan={7} className="text-right p-2">
                      Total
                    </TableCell>
                    <TableCell className="bg-yellow-100 p-2">{kittingTotals.percentage.toFixed(2)}%</TableCell>
                    <TableCell className="p-2">{kittingTotals.al.toFixed(4)}</TableCell>
                    <TableCell className="p-2">{kittingTotals.fe.toFixed(4)}</TableCell>
                    <TableCell className="p-2">{kittingTotals.bd.toFixed(4)}</TableCell>
                    <TableCell className="p-2">{kittingTotals.ap.toFixed(4)}</TableCell>
                    <TableCell className="p-2">{totalCost.toFixed(2)}</TableCell>
                    <TableCell className="p-2"></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={7} className="text-right font-medium p-2">
                      SELLING PRICE
                    </TableCell>
                    <TableCell colSpan={6} className="p-2">
                      <Input
                        value={sellingPriceInput}
                        onChange={(e) => setSellingPriceInput(e.target.value)}
                        placeholder={sellingPrice.toFixed(2)}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={7} className="text-right font-medium p-2">
                      VARIABLE COST
                    </TableCell>
                    <TableCell colSpan={6} className="p-2">
                      <Input value={variableCost.toFixed(2)} readOnly />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={7} className="text-right font-medium p-2">
                      GP %AGE
                    </TableCell>
                    <TableCell colSpan={6} className="p-2">
                      <Input value={gpPercentage.toFixed(2) + "%"} readOnly />
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t">
            <Button variant="outline" onClick={() => setIsKittingDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSaveKittingForm} disabled={isSubmitting} className="bg-purple-600 text-white hover:bg-purple-700">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}