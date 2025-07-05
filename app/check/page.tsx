// app/check/page.tsx
"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Loader2, AlertTriangle, CheckCircle, History, Settings } from "lucide-react"
import { format } from "date-fns"

// Shadcn UI components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// --- Configuration ---
const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwpDkP_Wmk8udmH6XsWPvpXgj-e3rGNxNJlOdAVXEWiCJWh3LI8CjIH4oJW5k5pjKFCvg/exec"
const SHEET_ID = "1niKq7rnnWdkH5gWXJIiVJQEsUKgK8qdjLokbo0rmt48"
const ACTUAL_PRODUCTION_SHEET = "Actual Production"
const MASTER_SHEET = "Master"

// --- Column Mapping for Check Data (Fixed: Added +1 to each column) ---
const CHECK_COLUMNS = {
  verificationTimestamp: 59, // Column BG (corrected)
  status: 61, // Column BI (corrected)
  actualQty: 62, // Column BJ (corrected)
}

// --- Type Definitions ---
interface PendingCheckItem {
  jobCardNo: string;
  deliveryOrderNo: string;
  productName: string;
  actualQuantity: number;
  producedQuantity: number;
  labTest1: string;
  labTest2: string;
  chemicalTest: string;
}

interface HistoryCheckItem {
  jobCardNo: string;
  deliveryOrderNo: string;
  productName: string;
  verifiedAt: string;
  verificationStatus: string;
  actualQty: number;
}

interface GvizRow {
  c: ({ v: any; f?: string; } | null)[]
}

// --- Column Definitions ---
const PENDING_COLUMNS_META = [
  { header: "Action", dataKey: "actionColumn", alwaysVisible: true }, // Moved to front
  { header: "Job Card No.", dataKey: "jobCardNo", alwaysVisible: true },
  { header: "Delivery Order No.", dataKey: "deliveryOrderNo", toggleable: true },
  { header: "Product Name", dataKey: "productName", toggleable: true },
  { header: "Actual Quantity", dataKey: "actualQuantity", toggleable: true },
  { header: "Produced Quantity", dataKey: "producedQuantity", toggleable: true },
  { header: "Lab Test 1", dataKey: "labTest1", toggleable: true },
  { header: "Lab Test 2", dataKey: "labTest2", toggleable: true },
  { header: "Chemical Test", dataKey: "chemicalTest", toggleable: true },
]

const HISTORY_COLUMNS_META = [
  { header: "Job Card No.", dataKey: "jobCardNo", alwaysVisible: true },
  { header: "Delivery Order No.", dataKey: "deliveryOrderNo", toggleable: true },
  { header: "Product Name", dataKey: "productName", toggleable: true },
  { header: "Verified At", dataKey: "verifiedAt", toggleable: true },
  { header: "Status", dataKey: "verificationStatus", toggleable: true },
  { header: "Actual Qty", dataKey: "actualQty", toggleable: true },
]

// Helper function to parse Google's date format
function parseGvizDate(gvizDateString: string | null | undefined): Date | null {
  if (!gvizDateString || typeof gvizDateString !== "string" || !gvizDateString.startsWith("Date(")) return null
  const numbers = gvizDateString.match(/\d+/g)
  if (!numbers || numbers.length < 3) return null
  const [year, month, day, hours = 0, minutes = 0, seconds = 0] = numbers.map(Number)
  const date = new Date(year, month, day, hours, minutes, seconds)
  return isNaN(date.getTime()) ? null : date
}

const initialFormState = {
  status: "",
  actualQty: "",
}

export default function CheckPage() {
  const [pendingChecks, setPendingChecks] = useState<PendingCheckItem[]>([])
  const [historyChecks, setHistoryChecks] = useState<HistoryCheckItem[]>([])
  const [statusOptions, setStatusOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedCheck, setSelectedCheck] = useState<PendingCheckItem | null>(null)
  const [formData, setFormData] = useState(initialFormState)
  const [formErrors, setFormErrors] = useState<Record<string, string | null>>({})
  const [activeTab, setActiveTab] = useState("pending")
  const [visiblePendingColumns, setVisiblePendingColumns] = useState<Record<string, boolean>>({})
  const [visibleHistoryColumns, setVisibleHistoryColumns] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const initializeVisibility = (columnsMeta: any[]) => {
      const visibility: Record<string, boolean> = {}
      columnsMeta.forEach((col) => {
        visibility[col.dataKey] = col.alwaysVisible || col.toggleable
      })
      return visibility
    }

    setVisiblePendingColumns(initializeVisibility(PENDING_COLUMNS_META))
    setVisibleHistoryColumns(initializeVisibility(HISTORY_COLUMNS_META))
  }, [])

  const fetchDataWithGviz = useCallback(async (sheetName: string) => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&cb=${new Date().getTime()}`
    try {
      const response = await fetch(url, { cache: "no-store" })
      if (!response.ok) throw new Error(`Network response was not ok for ${sheetName}.`)
      const text = await response.text()
      const jsonText = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1)
      const data = JSON.parse(jsonText)
      if (!data.table) throw new Error(`Invalid data structure from ${sheetName}.`)
      return data.table
    } catch (err) {
      console.error(`Failed to fetch or parse ${sheetName}:`, err)
      throw err
    }
  }, [])

  const loadAllData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [actualProductionTable, masterTable] = await Promise.all([
        fetchDataWithGviz(ACTUAL_PRODUCTION_SHEET),
        fetchDataWithGviz(MASTER_SHEET).catch(() => ({ rows: [] })),
      ])

      const processGvizTable = (table: any) => {
        if (!table || !table.rows || table.rows.length === 0) return []
        return table.rows
          .map((row: GvizRow, index: number) => {
            if (!row.c || !row.c.some((cell) => cell && cell.v !== null)) return null
            const rowData: { [key: string]: any } = { _originalIndex: index }
            row.c.forEach((cell, cellIndex) => {
              rowData[`col${cellIndex}`] = cell ? cell.v : null
            })
            return rowData
          })
          .filter(Boolean)
      }

      const actualProductionRows = processGvizTable(actualProductionTable)
      const masterDataRows = processGvizTable(masterTable)

      // --- Pending Logic: Column BF (col57) is NOT NULL, Column BG (col58) is NULL ---
      const pendingData: PendingCheckItem[] = actualProductionRows
        .filter(
          (row: { [key: string]: any }) =>
            row.col57 !== null &&
            String(row.col57).trim() !== "" &&
            (row.col58 === null || String(row.col58).trim() === ""),
        )
        .map((row: { [key: string]: any }) => ({
          jobCardNo: String(row.col1 || ""),
          deliveryOrderNo: String(row.col4 || ""),
          productName: String(row.col6 || ""),
          actualQuantity: Number(row.col7) || 0, // Assuming row.col7 is for Actual Quantity from Production sheet
          producedQuantity: Number(row.col8) || 0, // Assuming row.col8 is for Produced Quantity
          labTest1: String(row.col22 || "N/A"), // Lab Test 1 status (Column W)
          labTest2: String(row.col32 || "N/A"), // Lab Test 2 status (Column AG)
          chemicalTest: String(row.col42 || "N/A"), // Chemical Test status (Column AQ)
        }))

      setPendingChecks(pendingData)

      // --- History Logic: Column BF (col57) and BG (col58) are NOT NULL ---
      const historyData: HistoryCheckItem[] = actualProductionRows
        .filter(
          (row: { [key: string]: any }) =>
            row.col57 !== null &&
            String(row.col57).trim() !== "" &&
            row.col58 !== null &&
            String(row.col58).trim() !== "",
        )
        .map((row: { [key: string]: any }) => {
          const verifiedAt = parseGvizDate(row.col58)
          return {
            jobCardNo: String(row.col1 || ""),
            deliveryOrderNo: String(row.col4 || ""),
            productName: String(row.col6 || ""),
            verifiedAt: verifiedAt ? format(verifiedAt, "dd/MM/yy HH:mm") : String(row.col58),
            verificationStatus: String(row.col60 || "N/A"), // Status from Column BI (col60)
            actualQty: Number(row.col61) || 0, // Actual Qty from Column BJ (col61)
          }
        })
        .sort((a, b) => new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime())

      setHistoryChecks(historyData)

      // Get Status options from Master Sheet Column D
      const statuses: string[] = [...new Set(masterDataRows.map((row: { [key: string]: any }) => String(row.col3 || "")).filter(Boolean))]
      setStatusOptions(statuses)
    } catch (err: any) {
      setError(`Failed to load data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [fetchDataWithGviz])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  const handleFormChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}
    if (!formData.status) errors.status = "Status is required."
    if (!formData.actualQty || Number(formData.actualQty) <= 0) {
      errors.actualQty = "Valid actual quantity is required."
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleVerify = (check: PendingCheckItem) => {
    setSelectedCheck(check)
    setFormData({
      status: "",
      actualQty: check.actualQuantity.toString(), // Initialize with the actual quantity from production data
    })
    setFormErrors({})
    setIsDialogOpen(true)
  }

  const handleSaveVerification = async () => {
    if (!validateForm() || !selectedCheck) return

    setIsSubmitting(true)
    try {
      const timestamp = format(new Date(), "dd/MM/yyyy HH:mm:ss")

      // Create targeted column updates for Actual Production sheet
      const columnUpdates: { [key: number]: any } = {
        [CHECK_COLUMNS.verificationTimestamp]: timestamp,
        [CHECK_COLUMNS.status]: formData.status,
        [CHECK_COLUMNS.actualQty]: formData.actualQty,
      }

      const body = new URLSearchParams({
        sheetName: ACTUAL_PRODUCTION_SHEET,
        action: "updateByJobCard",
        jobCardNo: selectedCheck.jobCardNo,
        columnUpdates: JSON.stringify(columnUpdates),
      })

      const res = await fetch(WEB_APP_URL, { method: "POST", body })
      const result = await res.json()

      if (!result.success) {
        throw new Error(result.error || "Failed to update verification data in Actual Production sheet.")
      }

      alert("Verification completed successfully!")
      setIsDialogOpen(false)
      await loadAllData()
    } catch (err: any) {
      setError(err.message)
      alert(`Error: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleColumn = (tab: string, dataKey: string, checked: boolean) => {
    const setter = tab === "pending" ? setVisiblePendingColumns : setVisibleHistoryColumns
    setter((prev) => ({ ...prev, [dataKey]: checked }))
  }

  const handleSelectAllColumns = (tab: string, columnsMeta: any[], checked: boolean) => {
    const newVisibility: Record<string, boolean> = {}
    columnsMeta.forEach((col) => {
      if (col.toggleable) newVisibility[col.dataKey] = checked
    })
    const setter = tab === "pending" ? setVisiblePendingColumns : setVisibleHistoryColumns
    setter((prev) => ({ ...prev, ...newVisibility }))
  }

  const visiblePendingColumnsMeta = useMemo(
    () => PENDING_COLUMNS_META.filter((col) => visiblePendingColumns[col.dataKey]),
    [visiblePendingColumns],
  )

  const visibleHistoryColumnsMeta = useMemo(
    () => HISTORY_COLUMNS_META.filter((col) => visibleHistoryColumns[col.dataKey]),
    [visibleHistoryColumns],
  )

  const ColumnToggler = ({ tab, columnsMeta }: { tab: string; columnsMeta: any[] }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs bg-transparent ml-auto">
          <Settings className="mr-1.5 h-3.5 w-3.5" />
          View Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-3">
        <div className="grid gap-2">
          <p className="text-sm font-medium">Toggle Columns</p>
          <div className="flex items-center justify-between mt-1 mb-2">
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto text-xs"
              onClick={() => handleSelectAllColumns(tab, columnsMeta, true)}
            >
              Select All
            </Button>
            <span className="text-gray-300 mx-1">|</span>
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto text-xs"
              onClick={() => handleSelectAllColumns(tab, columnsMeta, false)}
            >
              Deselect All
            </Button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {columnsMeta
              .filter((col) => col.toggleable)
              .map((col) => (
                <div key={`toggle-${tab}-${col.dataKey}`} className="flex items-center space-x-2">
                  <Checkbox
                    id={`toggle-${tab}-${col.dataKey}`}
                    checked={
                      tab === "pending" ? !!visiblePendingColumns[col.dataKey] : !!visibleHistoryColumns[col.dataKey]
                    }
                    onCheckedChange={(checked) => handleToggleColumn(tab, col.dataKey, Boolean(checked))}
                  />
                  <Label htmlFor={`toggle-${tab}-${col.dataKey}`} className="text-xs font-normal cursor-pointer">
                    {col.header}
                  </Label>
                </div>
              ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-purple-600" /> {/* Changed to purple */}
        <p className="ml-4 text-lg">Loading Check Data...</p>
      </div>
    )

  if (error)
    return (
      <div className="p-8 text-center text-red-600 bg-red-50 rounded-md">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
        <p className="text-lg font-semibold">Error Loading Data</p>
        <p>{error}</p>
        <Button onClick={loadAllData} className="mt-4">
          Retry
        </Button>
      </div>
    )

  return (
    <div className="space-y-6 p-4 md:p-6 bg-white min-h-screen"> {/* Changed to white */}
      <Card className="shadow-md border-none">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-t-lg"> {/* Changed to purple gradient */}
          <CardTitle className="flex items-center gap-2 text-gray-800"> {/* Changed text color */}
            <CheckCircle className="h-6 w-6 text-purple-600" /> {/* Changed icon color */}
            Production Check & Verification
          </CardTitle>
          <CardDescription className="text-gray-700">Verify production items that have completed all testing phases.</CardDescription> {/* Changed text color */}
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full sm:w-[450px] grid-cols-2 mb-6">
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> Pending Checks{" "}
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0.5 text-xs"> {/* Added px-1.5 py-0.5 text-xs */}
                  {pendingChecks.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" /> Check History{" "}
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0.5 text-xs"> {/* Added px-1.5 py-0.5 text-xs */}
                  {historyChecks.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <Card className="shadow-sm border border-border"> {/* Added border-border */}
                <CardHeader className="py-3 px-4 bg-purple-50 rounded-md p-2"> {/* Light purple header */}
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-md font-semibold text-foreground"> {/* Added font-semibold text-foreground */}
                        <CheckCircle className="h-5 w-5 text-primary mr-2" /> {/* Light purple icon */}
                        Pending Items ({pendingChecks.length})
                    </CardTitle>
                    <ColumnToggler tab="pending" columnsMeta={PENDING_COLUMNS_META} />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          {visiblePendingColumnsMeta.map((col) => (
                            <TableHead key={col.dataKey}>{col.header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingChecks.length > 0 ? (
                          pendingChecks.map((check, index) => (
                            <TableRow key={`${check.jobCardNo}-${index}`} className="hover:bg-purple-50/50"> {/* Light purple hover */}
                              {visiblePendingColumnsMeta.map((col) => (
                                <TableCell key={col.dataKey} className="whitespace-nowrap text-sm">
                                  {col.dataKey === "actionColumn" ? (
                                    <Button size="sm" onClick={() => handleVerify(check)} className="bg-purple-600 text-white hover:bg-purple-700"> {/* Light purple button */}
                                      <CheckCircle className="mr-2 h-4 w-4" />
                                      Verify
                                    </Button>
                                  ) : col.dataKey === "labTest1" ||
                                    col.dataKey === "labTest2" ||
                                    col.dataKey === "chemicalTest" ? (
                                    <Badge
                                      variant={
                                        check[col.dataKey as keyof PendingCheckItem] === "Pass" || check[col.dataKey as keyof PendingCheckItem] === "Accepted"
                                          ? "default"
                                          : "destructive"
                                      }
                                    >
                                      {check[col.dataKey as keyof PendingCheckItem]}
                                    </Badge>
                                  ) : (
                                    check[col.dataKey as keyof PendingCheckItem] || "-"
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={visiblePendingColumnsMeta.length} className="h-48">
                              <div className="flex flex-col items-center justify-center text-center border-2 border-dashed border-purple-200/50 bg-purple-50/50 rounded-lg mx-4 my-4 flex-1"> {/* Light purple border/bg */}
                                <CheckCircle className="h-12 w-12 text-purple-500 mb-3" /> {/* Light purple icon */}
                                <p className="font-medium text-foreground">No Pending Checks</p>
                                <p className="text-sm text-muted-foreground">
                                  All production items have been verified.
                                </p>
                              </div>
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
              <Card className="shadow-sm border border-border"> {/* Added border-border */}
                <CardHeader className="py-3 px-4 bg-purple-50 rounded-md p-2"> {/* Light purple header */}
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-md font-semibold text-foreground"> {/* Added font-semibold text-foreground */}
                        <History className="h-5 w-5 text-primary mr-2" /> {/* Light purple icon */}
                        History Items ({historyChecks.length})
                    </CardTitle>
                    <ColumnToggler tab="history" columnsMeta={HISTORY_COLUMNS_META} />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          {visibleHistoryColumnsMeta.map((col) => (
                            <TableHead key={col.dataKey}>{col.header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyChecks.length > 0 ? (
                          historyChecks.map((check, index) => (
                            <TableRow key={`${check.jobCardNo}-${index}`} className="hover:bg-purple-50/50"> {/* Light purple hover */}
                              {visibleHistoryColumnsMeta.map((col) => (
                                <TableCell key={col.dataKey} className="whitespace-nowrap text-sm">
                                  {col.dataKey === "verificationStatus" ? (
                                    <Badge variant="default">{check.verificationStatus}</Badge>
                                  ) : (
                                    check[col.dataKey as keyof HistoryCheckItem] || "-"
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={visibleHistoryColumnsMeta.length} className="h-48">
                              <div className="flex flex-col items-center justify-center text-center border-2 border-dashed border-purple-200/50 bg-purple-50/50 rounded-lg mx-4 my-4 flex-1"> {/* Light purple border/bg */}
                                <History className="h-12 w-12 text-purple-500 mb-3" /> {/* Light purple icon */}
                                <p className="font-medium text-foreground">No Check History</p>
                                <p className="text-sm text-muted-foreground">
                                  Verified production records will appear here.
                                </p>
                              </div>
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Verify Production for JC: {selectedCheck?.jobCardNo}</DialogTitle>
            <DialogDescription>Complete the verification process by providing the required details.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSaveVerification()
            }}
            className="space-y-4 pt-4"
          >
            <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/50">
              <div>
                <Label className="text-xs">DO No.</Label>
                <p className="text-sm font-semibold">{selectedCheck?.deliveryOrderNo}</p>
              </div>
              <div>
                <Label className="text-xs">Product Name</Label>
                <p className="text-sm font-semibold">{selectedCheck?.productName}</p>
              </div>
              <div>
                <Label className="text-xs">Produced Quantity</Label>
                <p className="text-sm font-semibold">{selectedCheck?.producedQuantity}</p>
              </div>
              <div>
                <Label className="text-xs">Original Actual Qty</Label>
                <p className="text-sm font-semibold">{selectedCheck?.actualQuantity}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select value={formData.status} onValueChange={(v) => handleFormChange("status", v)}>
                <SelectTrigger className={formErrors.status ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select verification status..." />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.status && <p className="text-xs text-red-600 mt-1">{formErrors.status}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="actualQty">Actual Quantity *</Label>
              <Input
                id="actualQty"
                type="number"
                step="1"
                min="0"
                value={formData.actualQty}
                onChange={(e) => handleFormChange("actualQty", e.target.value)}
                className={formErrors.actualQty ? "border-red-500" : ""}
              />
              {formErrors.actualQty && <p className="text-xs text-red-600 mt-1">{formErrors.actualQty}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-purple-600 text-white hover:bg-purple-700"> {/* Light purple button */}
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete Verification
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}