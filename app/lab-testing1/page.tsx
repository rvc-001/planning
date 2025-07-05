"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Loader2, AlertTriangle, CalendarIcon, TestTube, History, Settings, Eye } from "lucide-react"
import { format } from "date-fns"
import { useGoogleSheet, parseGvizDate } from "@/lib/g-sheets"

// Shadcn UI components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

// --- Type Definitions ---
interface RawMaterial {
  name: string
  quantity: number | string
}

interface ProductionItem {
  _rowIndex: number
  jobCardNo: string
  deliveryOrderNo: string
  productName: string
  quantity: number
  expectedDeliveryDate: string
  priority: string
  dateOfProduction: string
  supervisorName: string
  shift: string
  rawMaterials: RawMaterial[]
  quantities: string
  machineHours: string
  productionNotes: string
}

interface HistoryItem {
  _rowIndex: number
  jobCardNo: string
  deliveryOrderNo: string
  productName: string
  quantity: number
  testStatus: string
  dateOfTest: string
  testedBy: string
  wcPercentage: string
  finalSettingTime: string
  initialSettingTime: string
  whatToBeMixed: string
  flowOfMaterial: string
  sieveAnalysisTest: string
  notes: string
  test1CompletedAt: string
}

// Re-defining TimeInput to simply be a string for HH:MM:SS
interface TimeInput {
  h: string // Will now be 'HH:MM:SS' string
  m: string // Not used directly for input, but kept for consistency
  s: string // Not used directly for input, but kept for consistency
}

// --- Configuration ---
const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwpDkP_Wmk8udmH6XsWPvpXgj-e3rGNxNJlOdAVXEWiCJWh3LI8CjIH4oJW5k5pjKFCvg/exec"
const JOBCARDS_SHEET = "JobCards"
const MASTER_SHEET = "Master"

// --- Column Mapping for Lab Test 1 Data ---
const LAB_TEST_COLUMNS = {
  test1CompletedAt: 20, // Column T (index 19, but 1-based = 20)
  testStatus: 22, // Column V (index 21, but 1-based = 22)
  dateOfTest: 23, // Column W (index 22, but 1-based = 23)
  wcPercentage: 24, // Column X (index 23, but 1-based = 24)
  testedBy: 25, // Column Y (index 24, but 1-based = 25)
  initialSettingTime: 26, // Column Z (index 25, but 1-based = 26)
  flowOfMaterial: 27, // Column AA (index 26, but 1-based = 27)
  finalSettingTime: 28, // Column AB (index 27, but 1-based = 28)
  whatToBeMixed: 29, // Column AC (index 28, but 1-based = 29)
  sieveAnalysis: 30, // Column AD (index 29, but 1-based = 30)
}

// --- Column Definitions ---
const PENDING_COLUMNS_META = [
  { header: "Action", dataKey: "actionColumn", alwaysVisible: true, toggleable: false },
  { header: "Job Card No.", dataKey: "jobCardNo", alwaysVisible: true, toggleable: false },
  { header: "Delivery Order No.", dataKey: "deliveryOrderNo", toggleable: true },
  { header: "Quantity", dataKey: "quantity", toggleable: true },
  { header: "Expected Delivery Date", dataKey: "expectedDeliveryDate", toggleable: true },
  { header: "Priority", dataKey: "priority", toggleable: true },
  { header: "Date of Production", dataKey: "dateOfProduction", toggleable: true },
  { header: "Supervisor Name", dataKey: "supervisorName", toggleable: true },
  { header: "Shift", dataKey: "shift", toggleable: true },
  { header: "Raw Materials", dataKey: "rawMaterials", toggleable: true },
  { header: "Quantities", dataKey: "quantities", toggleable: true },
  { header: "Machine Hours", dataKey: "machineHours", toggleable: true },
  { header: "Production Notes", dataKey: "productionNotes", toggleable: true },
]

const HISTORY_COLUMNS_META = [
  { header: "Job Card No.", dataKey: "jobCardNo", alwaysVisible: true, toggleable: false },
  { header: "Delivery Order No.", dataKey: "deliveryOrderNo", toggleable: true },
  { header: "Quantity", dataKey: "quantity", toggleable: true },
  { header: "Test Status", dataKey: "testStatus", toggleable: true },
  { header: "Date of Test", dataKey: "dateOfTest", toggleable: true },
  { header: "Tested By", dataKey: "testedBy", toggleable: true },
  { header: "WC Percentage %", dataKey: "wcPercentage", toggleable: true },
  { header: "Final Setting Time", dataKey: "finalSettingTime", toggleable: true },
  { header: "Initial Setting Time", dataKey: "initialSettingTime", toggleable: true },
  { header: "What To Be Mixed", dataKey: "whatToBeMixed", toggleable: true },
  { header: "Flow of Material", dataKey: "flowOfMaterial", toggleable: true },
  { header: "Sieve Analysis Test", dataKey: "sieveAnalysisTest", toggleable: true },
  { header: "Notes", dataKey: "notes", toggleable: true },
]

// Initial State for Form
const initialFormState = {
  dateOfTest: new Date(),
  testStatus: "",
  wcPercentage: "",
  testedBy: "",
  initialSettingTime: { h: "", m: "", s: "" }, // Change this to single string for HH:MM:SS
  finalSettingTime: { h: "", m: "", s: "" }, // Change this to single string for HH:MM:SS
  whatToBeMixed: "",
  flowOfMaterial: "",
  sieveAnalysis: "",
}

export default function LabTesting1Page() {
  const [pendingTests, setPendingTests] = useState<ProductionItem[]>([])
  const [historyTests, setHistoryTests] = useState<HistoryItem[]>([])
  const [flowOfMaterialOptions, setFlowOfMaterialOptions] = useState<string[]>([])
  const [statusOptions, setStatusOptions] = useState<string[]>([])
  const [testedByOptions, setTestedByOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedProduction, setSelectedProduction] = useState<ProductionItem | null>(null)
  const [formData, setFormData] = useState(initialFormState)
  const [formErrors, setFormErrors] = useState<Record<string, string | null>>({})
  const [activeTab, setActiveTab] = useState("pending")
  const [visiblePendingColumns, setVisiblePendingColumns] = useState<Record<string, boolean>>({})
  const [visibleHistoryColumns, setVisibleHistoryColumns] = useState<Record<string, boolean>>({})
  const [viewingMaterials, setViewingMaterials] = useState<RawMaterial[] | null>(null)

  const { fetchData: fetchJobCardsData } = useGoogleSheet(JOBCARDS_SHEET)
  const { fetchData: fetchMasterData } = useGoogleSheet(MASTER_SHEET)

  useEffect(() => {
    const initializeVisibility = (columnsMeta: any[]) => {
      const visibility: Record<string, boolean> = {}
      columnsMeta.forEach((col) => {
        visibility[col.dataKey] = col.alwaysVisible !== false
      })
      return visibility
    }

    setVisiblePendingColumns(initializeVisibility(PENDING_COLUMNS_META))
    setVisibleHistoryColumns(initializeVisibility(HISTORY_COLUMNS_META))
  }, [])

  const loadAllData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [jobCardsTable, masterTable] = await Promise.all([fetchJobCardsData(), fetchMasterData()])

      const processGvizTable = (table: any) => {
        if (!table || !table.rows || table.rows.length === 0) return []
        return table.rows
          .map((row: any, index: number) => {
            if (!row.c || !row.c.some((cell: any) => cell && cell.v !== null)) return null
            const rowData: any = { _rowIndex: index + 5 }
            row.c.forEach((cell: any, cellIndex: number) => {
              rowData[`col${cellIndex}`] = cell ? cell.v : null
            })
            return rowData
          })
          .filter(Boolean)
      }

      const jobCardDataRows = processGvizTable(jobCardsTable)
      const masterDataRows = processGvizTable(masterTable)

      // Parse raw materials from job card data (assuming they're stored in specific columns)
      const parseRawMaterials = (row: any): RawMaterial[] => {
        const materials: RawMaterial[] = []
        // Assuming raw materials are stored in columns 30-49 (name, quantity pairs)
        for (let i = 0; i < 10; i++) {
          const name = row[`col${30 + i * 2}`]
          const quantity = row[`col${31 + i * 2}`]
          if (name) {
            materials.push({ name: String(name), quantity: quantity || 0 })
          }
        }
        return materials
      }

      // --- Pending Logic: Column S (col18) is NOT NULL, Column T (col19) is NULL ---
      const pendingData: ProductionItem[] = jobCardDataRows
        .filter(
          (row: any) =>
            row.col18 !== null &&
            String(row.col18).trim() !== "" &&
            (row.col19 === null || String(row.col19).trim() === ""),
        )
        .map((row: any) => ({
          _rowIndex: row._rowIndex,
          jobCardNo: String(row.col1 || ""),
          deliveryOrderNo: String(row.col4 || ""),
          productName: String(row.col6 || ""),
          quantity: Number(row.col7 || 0),
          expectedDeliveryDate: row.col12 ? format(parseGvizDate(row.col12), "dd/MM/yyyy") : "",
          priority: String(row.col11 || ""),
          dateOfProduction: row.col8 ? format(parseGvizDate(row.col8), "dd/MM/yyyy") : "",
          supervisorName: String(row.col3 || ""),
          shift: String(row.col9 || ""),
          rawMaterials: parseRawMaterials(row),
          quantities: String(row.col7 || ""),
          machineHours: String(row.col50 || ""),
          productionNotes: String(row.col14 || ""),
        }))

      setPendingTests(pendingData)

      const historyFiltered: HistoryItem[] = jobCardDataRows
        .filter(
          (row: any) =>
            row.col18 !== null &&
            String(row.col18).trim() !== "" &&
            row.col19 !== null &&
            String(row.col19).trim() !== "",
        )
        .map((row: any) => ({
          _rowIndex: row._rowIndex,
          jobCardNo: String(row.col1 || ""),
          deliveryOrderNo: String(row.col4 || ""),
          productName: String(row.col6 || ""),
          quantity: Number(row.col7 || 0),
          testStatus: String(row.col21 || ""),
          dateOfTest: row.col22 ? format(parseGvizDate(row.col22), "dd/MM/yyyy") : "",
          testedBy: String(row.col51 || ""), // Assuming tested by is in a specific column
          wcPercentage: String(row.col23 || ""),
          finalSettingTime: String(row.col26 || ""),
          initialSettingTime: String(row.col24 || ""),
          whatToBeMixed: String(row.col27 || ""),
          flowOfMaterial: String(row.col25 || ""),
          sieveAnalysisTest: String(row.col28 || ""),
          notes: String(row.col14 || ""),
          test1CompletedAt: parseGvizDate(row.col19)
            ? format(parseGvizDate(row.col19), "dd/MM/yy HH:mm")
            : String(row.col19),
        }))
        .sort((a, b) => new Date(b.test1CompletedAt).getTime() - new Date(a.test1CompletedAt).getTime())

      setHistoryTests(historyFiltered)

      const flowOptions: string[] = [
        ...new Set(masterDataRows.map((row: any) => String(row.col10 || "")).filter(Boolean)),
      ]
      setFlowOfMaterialOptions(flowOptions)

      const statuses: string[] = [...new Set(masterDataRows.map((row: any) => String(row.col3 || "")).filter(Boolean))]
      setStatusOptions(statuses)

      // Get Tested By options from Master Sheet Column E
      const testedByOpts: string[] = [
        ...new Set(masterDataRows.map((row: any) => String(row.col4 || "")).filter(Boolean)),
      ]
      setTestedByOptions(testedByOpts)
    } catch (err: any) {
      setError(`Failed to load data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [fetchJobCardsData, fetchMasterData])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  const handleOpenLabTesting = (production: ProductionItem) => {
    setSelectedProduction(production)
    setFormData(initialFormState)
    setFormErrors({})
    setIsDialogOpen(true)
  }

  const handleFormChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // Modified handleTimeChange to directly update the HH:MM:SS string
  const handleTimeInputChange = (field: "initialSettingTime" | "finalSettingTime", value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: { h: value, m: "", s: "" }, // Store the full string in 'h' for now
    }))
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}
    const timeRegex = /^(?:2[0-3]|[01]?[0-9]):[0-5]?[0-9]:[0-5]?[0-9]$/ // HH:MM:SS regex

    if (!formData.testStatus) errors.testStatus = "Status is required."
    if (!formData.dateOfTest) errors.dateOfTest = "Date of Test is required."
    if (!formData.flowOfMaterial) errors.flowOfMaterial = "Flow of Material is required."
    if (!formData.wcPercentage || Number(formData.wcPercentage) <= 0) {
      errors.wcPercentage = "Valid WC % is required."
    } else if (Number(formData.wcPercentage) > 100) {
      errors.wcPercentage = "Percentage cannot be over 100."
    }
    if (!formData.testedBy) errors.testedBy = "Tested By is required."

    // Validate initialSettingTime
    if (formData.initialSettingTime.h && !timeRegex.test(formData.initialSettingTime.h)) {
      errors.initialSettingTime = "Initial Setting Time must be in HH:MM:SS format."
    }

    // Validate finalSettingTime
    if (formData.finalSettingTime.h && !timeRegex.test(formData.finalSettingTime.h)) {
      errors.finalSettingTime = "Final Setting Time must be in HH:MM:SS format."
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Updated formatTime to simply return the stored HH:MM:SS string
  const formatTime = (time: TimeInput) => {
    return time.h || "" // Returns the HH:MM:SS string or empty if not set
  }

  const handleSaveLabTest = async () => {
    if (!validateForm() || !selectedProduction) return

    setIsSubmitting(true)
    try {
      const timestamp = format(new Date(), "dd/MM/yyyy HH:mm:ss")

      // Create targeted column updates instead of a full row array
      const columnUpdates = {
        [LAB_TEST_COLUMNS.test1CompletedAt]: timestamp,
        [LAB_TEST_COLUMNS.testStatus]: formData.testStatus,
        [LAB_TEST_COLUMNS.dateOfTest]: format(formData.dateOfTest, "dd/MM/yyyy"),
        [LAB_TEST_COLUMNS.wcPercentage]: formData.wcPercentage,
        [LAB_TEST_COLUMNS.testedBy]: formData.testedBy,
        [LAB_TEST_COLUMNS.initialSettingTime]: formatTime(formData.initialSettingTime),
        [LAB_TEST_COLUMNS.flowOfMaterial]: formData.flowOfMaterial,
        [LAB_TEST_COLUMNS.finalSettingTime]: formatTime(formData.finalSettingTime),
        [LAB_TEST_COLUMNS.whatToBeMixed]: formData.whatToBeMixed,
        [LAB_TEST_COLUMNS.sieveAnalysis]: formData.sieveAnalysis,
      }

      const body = new URLSearchParams({
        sheetName: JOBCARDS_SHEET,
        action: "updateColumns",
        rowIndex: selectedProduction._rowIndex.toString(),
        columnUpdates: JSON.stringify(columnUpdates),
      })

      const res = await fetch(WEB_APP_URL, { method: "POST", body })
      const result = await res.json()

      if (!result.success) {
        throw new Error(result.error || "Failed to update Lab Test 1 data in JobCards sheet.")
      }

      alert("Lab Test 1 data saved successfully!")
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

  const renderRawMaterials = (materials: RawMaterial[]) => {
    if (!materials || materials.length === 0) return "-"
    if (materials.length <= 2) {
      return materials.map((m) => m.name).join(", ")
    }
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs bg-transparent"
        onClick={() => setViewingMaterials(materials)}
      >
        <Eye className="h-3.5 w-3.5 mr-1.5" />
        View ({materials.length})
      </Button>
    )
  }

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
        <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
        <p className="ml-4 text-lg">Loading Lab Test Data...</p>
      </div>
    )

  if (error)
    return (
      <div className="p-8 text-center text-red-600 bg-red-50 rounded-md">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
        <p className="text-lg font-semibold">Error Loading Data</p>
        <p className="text-sm">{error}</p>
        <Button onClick={loadAllData} className="mt-4">
          Retry
        </Button>
      </div>
    )

  return (
    <div className="space-y-6 p-4 md:p-6 bg-white min-h-screen">
      <Card className="shadow-md border-none">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-gray-800">
            <TestTube className="h-6 w-6 text-purple-600" />
            Lab Testing: Physical Test 1
          </CardTitle>
          <CardDescription className="text-gray-700">
            Perform Lab Test 1. Pending items have Column S filled and T empty.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 lg:p-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full sm:w-[450px] grid-cols-2 mb-6">
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <TestTube className="h-4 w-4" /> Pending Tests
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0.5 text-xs">
                  {pendingTests.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" /> Test History
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0.5 text-xs">
                  {historyTests.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-0">
              <Card className="shadow-sm border border-border">
                <CardHeader className="py-3 px-4 bg-purple-50 rounded-md p-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="flex items-center text-md font-semibold text-foreground">
                      <TestTube className="h-5 w-5 text-primary mr-2" />
                      Pending Items ({pendingTests.length})
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
                        {pendingTests.length > 0 ? (
                          pendingTests.map((production) => (
                            <TableRow key={production._rowIndex} className="hover:bg-purple-50/50">
                              {visiblePendingColumnsMeta.map((col) => (
                                <TableCell key={col.dataKey} className="whitespace-nowrap text-sm">
                                  {col.dataKey === "actionColumn" ? (
                                    <Button
                                      size="sm"
                                      onClick={() => handleOpenLabTesting(production)}
                                      className="bg-purple-600 text-white hover:bg-purple-700"
                                    >
                                      <TestTube className="mr-2 h-4 w-4" />
                                      Perform Test
                                    </Button>
                                  ) : col.dataKey === "rawMaterials" ? (
                                    renderRawMaterials(production.rawMaterials)
                                  ) : (
                                    production[col.dataKey as keyof ProductionItem] || "-"
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={visiblePendingColumnsMeta.length} className="h-48">
                              <div className="flex flex-col items-center justify-center text-center border-2 border-dashed border-purple-200/50 bg-purple-50/50 rounded-lg mx-4 my-4 flex-1">
                                <TestTube className="h-12 w-12 text-purple-500 mb-3" />
                                <p className="font-medium text-foreground">No Pending Tests</p>
                                <p className="text-sm text-muted-foreground">All required tests have been completed.</p>
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

            <TabsContent value="history" className="mt-0">
              <Card className="shadow-sm border border-border">
                <CardHeader className="py-3 px-4 bg-purple-50 rounded-md p-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="flex items-center text-md font-semibold text-foreground">
                      <History className="h-5 w-5 text-primary mr-2" />
                      History Items ({historyTests.length})
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
                        {historyTests.length > 0 ? (
                          historyTests.map((test) => (
                            <TableRow key={test._rowIndex} className="hover:bg-purple-50/50">
                              {visibleHistoryColumnsMeta.map((col) => (
                                <TableCell key={col.dataKey} className="whitespace-nowrap text-sm">
                                  {test[col.dataKey as keyof HistoryItem] || "-"}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={visibleHistoryColumnsMeta.length} className="h-48">
                              <div className="flex flex-col items-center justify-center text-center border-2 border-dashed border-purple-200/50 bg-purple-50/50 rounded-lg mx-4 my-4 flex-1">
                                <History className="h-12 w-12 text-purple-500 mb-3" />
                                <p className="font-medium text-foreground">No Test History</p>
                                <p className="text-sm text-muted-foreground">
                                  Completed test records will appear here.
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

      {/* Raw Materials Viewing Dialog */}
      <Dialog open={!!viewingMaterials} onOpenChange={(isOpen) => !isOpen && setViewingMaterials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raw Materials Used</DialogTitle>
            <DialogDescription>Full list of materials and quantities used for this production run.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material Name</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewingMaterials?.map((material, index) => (
                  <TableRow key={index}>
                    <TableCell>{material.name}</TableCell>
                    <TableCell className="text-right">{material.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lab Testing Form Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lab Test 1 Details for JC: {selectedProduction?.jobCardNo}</DialogTitle>
            <DialogDescription>Fill out the test results below. Fields with * are required.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSaveLabTest()
            }}
            className="space-y-6 p-1"
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/50">
              <div>
                <Label className="text-xs">DO No.</Label>
                <p className="text-sm font-semibold">{selectedProduction?.deliveryOrderNo}</p>
              </div>
              <div>
                <Label className="text-xs">Product</Label>
                <p className="text-sm font-semibold">{selectedProduction?.productName}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Status *</Label>
                <Select value={formData.testStatus} onValueChange={(v) => handleFormChange("testStatus", v)}>
                  <SelectTrigger className={formErrors.testStatus ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date of Test *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.dateOfTest && "text-muted-foreground",
                        formErrors.dateOfTest && "border-red-500",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.dateOfTest ? format(formData.dateOfTest, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.dateOfTest}
                      onSelect={(d) => handleFormChange("dateOfTest", d)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wcPercentage">WC Percentage % *</Label>
                <Input
                  id="wcPercentage"
                  type="number"
                  step="0.1"
                  max="100"
                  value={formData.wcPercentage}
                  onChange={(e) => handleFormChange("wcPercentage", e.target.value)}
                  className={formErrors.wcPercentage ? "border-red-500" : ""}
                />
                {formErrors.wcPercentage && <p className="text-xs text-red-600 mt-1">{formErrors.wcPercentage}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Tested By *</Label>
                <Select value={formData.testedBy} onValueChange={(v) => handleFormChange("testedBy", v)}>
                  <SelectTrigger className={formErrors.testedBy ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select tester" />
                  </SelectTrigger>
                  <SelectContent>
                    {testedByOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.testedBy && <p className="text-xs text-red-600 mt-1">{formErrors.testedBy}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="initialSettingTime">Initial Setting Time (HH:MM:SS)</Label>
                <Input
                  id="initialSettingTime"
                  type="text"
                  placeholder="e.g., 00:30:00"
                  value={formData.initialSettingTime.h} // Use .h to store the string
                  onChange={(e) => handleTimeInputChange("initialSettingTime", e.target.value)}
                  className={formErrors.initialSettingTime ? "border-red-500" : ""}
                />
                {formErrors.initialSettingTime && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.initialSettingTime}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="finalSettingTime">Final Setting Time (HH:MM:SS)</Label>
                <Input
                  id="finalSettingTime"
                  type="text"
                  placeholder="e.g., 01:00:00"
                  value={formData.finalSettingTime.h} // Use .h to store the string
                  onChange={(e) => handleTimeInputChange("finalSettingTime", e.target.value)}
                  className={formErrors.finalSettingTime ? "border-red-500" : ""}
                />
                {formErrors.finalSettingTime && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.finalSettingTime}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Flow Of Material *</Label>
                <Select value={formData.flowOfMaterial} onValueChange={(v) => handleFormChange("flowOfMaterial", v)}>
                  <SelectTrigger className={formErrors.flowOfMaterial ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select flow..." />
                  </SelectTrigger>
                  <SelectContent>
                    {flowOfMaterialOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatToBeMixed">What To Be Mixed</Label>
                <Input
                  id="whatToBeMixed"
                  value={formData.whatToBeMixed}
                  onChange={(e) => handleFormChange("whatToBeMixed", e.target.value)}
                  placeholder="Mix specifications"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sieveAnalysis">Sieve Analysis</Label>
              <Textarea
                id="sieveAnalysis"
                value={formData.sieveAnalysis}
                onChange={(e) => handleFormChange("sieveAnalysis", e.target.value)}
                placeholder="Sieve analysis results"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-purple-600 text-white hover:bg-purple-700">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Test Results
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
