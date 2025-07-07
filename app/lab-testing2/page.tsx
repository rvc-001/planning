"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Loader2, AlertTriangle, CalendarIcon, TestTube2, History, Settings, Eye } from "lucide-react"
import { format } from "date-fns"
import { useGoogleSheet, parseGvizDate } from "@/lib/g-sheets"
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
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

// Configuration
const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwpDkP_Wmk8udmH6XsWPvpXgj-e3rGNxNJlOdAVXEWiCJWh3LI8CjIH4oJW5k5pjKFCvg/exec"
const JOBCARDS_SHEET = "JobCards"
const MASTER_SHEET = "Master"
const PRODUCTION_SHEET = "Production"
const ACTUAL_PRODUCTION_SHEET = "Actual Production"

// Type Definitions
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
  machineHours: string
  labTest1Status: string
}

interface HistoryItem {
  _rowIndex: number
  jobCardNo: string
  deliveryOrderNo: string
  quantity: number
  test1Status: string
  dateOfTest2: string
  testedBy: string
  test2Status: string
  bdAt110: string
  ccsAt1100: string
  ccsAt100: string
  plcAt1100: string
  bdAt1100: string
  test2CompletedAt: string
}

// Add this function for formatting machine hours
const formatMachineHours = (hours) => {
  if (!hours || hours === "-") return "-"
  const hoursStr = String(hours)
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(hoursStr)) return hoursStr
  if (hoursStr.includes("Date(")) {
    const match = hoursStr.match(/Date$$(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)$$/)
    if (match) {
      const [, year, month, day, h, m, s] = match
      return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`
    }
    const numbers = hoursStr.match(/\d+/g)
    if (numbers && numbers.length >= 6) {
      const h = numbers[numbers.length - 3]
      const m = numbers[numbers.length - 2]
      const s = numbers[numbers.length - 1]
      return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`
    }
  }
  if (hours instanceof Date) {
    const h = hours.getHours()
    const m = hours.getMinutes()
    const s = hours.getSeconds()
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }
  const numHours = Number.parseFloat(hoursStr)
  if (!isNaN(numHours)) {
    const wholeHours = Math.floor(numHours)
    const minutes = Math.floor((numHours - wholeHours) * 60)
    const seconds = Math.floor(((numHours - wholeHours) * 60 - minutes) * 60)
    return `${wholeHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }
  return hoursStr
}

// Column Mapping for Lab Test 2 Data
const LAB_TEST_2_COLUMNS = {
  test2CompletedAt: 32, // Column AF (index 31, but 1-based = 32)
  testStatus: 34, // Column AH (index 33, but 1-based = 34)
  testedBy: 35, // Column AI (index 34, but 1-based = 35)
  dateOfTest: 36, // Column AJ (index 35, but 1-based = 36)
  bdAt110: 37, // Column AK (index 36, but 1-based = 37)
  ccsAt100: 38, // Column AL (index 37, but 1-based = 38)
  bdAt1100: 39, // Column AM (index 38, but 1-based = 39)
  ccsAt1100: 40, // Column AN (index 39, but 1-based = 40)
  plcAt1100: 41, // Column AO (index 40, but 1-based = 41)
}

// Column Definitions
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
  { header: "Machine Hours", dataKey: "machineHours", toggleable: true },
  { header: "Lab Test 1 Status", dataKey: "labTest1Status", toggleable: true },
]

const HISTORY_COLUMNS_META = [
  { header: "Job Card No.", dataKey: "jobCardNo", alwaysVisible: true, toggleable: false },
  { header: "Delivery Order No.", dataKey: "deliveryOrderNo", toggleable: true },
  { header: "Quantity", dataKey: "quantity", toggleable: true },
  { header: "Test 1 Status", dataKey: "test1Status", toggleable: true },
  { header: "Date of Test 2", dataKey: "dateOfTest2", toggleable: true },
  { header: "Tested By", dataKey: "testedBy", toggleable: true },
  { header: "Test 2 Status", dataKey: "test2Status", toggleable: true },
  { header: "BD at 110°C", dataKey: "bdAt110", toggleable: true },
  { header: "CCS at 1100°C", dataKey: "ccsAt1100", toggleable: true },
  { header: "CCS at 100°C", dataKey: "ccsAt100", toggleable: true },
  { header: "PLC at 1100°C", dataKey: "plcAt1100", toggleable: true },
  { header: "BD at 1100°C", dataKey: "bdAt1100", toggleable: true },
]

// Initial State for Form
const initialFormState = {
  dateOfTest: new Date(),
  testStatus: "",
  bdAt110: "",
  ccsAt100: "",
  bdAt1100: "",
  ccsAt1100: "",
  plcAt1100: "",
  testedBy: "",
}

export default function LabTesting2Page() {
  const [pendingTests, setPendingTests] = useState<ProductionItem[]>([])
  const [historyTests, setHistoryTests] = useState<HistoryItem[]>([])
  const [statusOptions, setStatusOptions] = useState<string[]>([])
  const [testedByOptions, setTestedByOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedTest, setSelectedTest] = useState<ProductionItem | null>(null)
  const [formData, setFormData] = useState(initialFormState)
  const [formErrors, setFormErrors] = useState<Record<string, string | null>>({})
  const [activeTab, setActiveTab] = useState("pending")
  const [visiblePendingColumns, setVisiblePendingColumns] = useState<Record<string, boolean>>({})
  const [visibleHistoryColumns, setVisibleHistoryColumns] = useState<Record<string, boolean>>({})
  const [viewingMaterials, setViewingMaterials] = useState<RawMaterial[] | null>(null)

  const { fetchData: fetchJobCardsData } = useGoogleSheet(JOBCARDS_SHEET)
  const { fetchData: fetchMasterData } = useGoogleSheet(MASTER_SHEET)
  const { fetchData: fetchProductionData } = useGoogleSheet(PRODUCTION_SHEET)
  const { fetchData: fetchActualProductionData } = useGoogleSheet(ACTUAL_PRODUCTION_SHEET)

  const processGvizTable = (table) => {
    if (!table || !table.rows || table.rows.length === 0) {
      return []
    }
    const firstDataRowIndex = table.rows.findIndex(
      (r) => r && r.c && r.c.some((cell) => cell && cell.v !== null && cell.v !== ""),
    )
    if (firstDataRowIndex === -1) return []

    const colIds = table.cols.map((col) => col.id)
    const dataRows = table.rows.slice(firstDataRowIndex)

    return dataRows
      .map((row, rowIndex) => {
        if (!row || !row.c || row.c.every((cell) => !cell || cell.v === null || cell.v === "")) {
          return null
        }
        const rowData = { _rowIndex: firstDataRowIndex + rowIndex + 1 }
        row.c.forEach((cell, cellIndex) => {
          const colId = colIds[cellIndex]
          if (colId) rowData[colId] = cell ? cell.v : null
        })
        return rowData
      })
      .filter(Boolean)
  }

  useEffect(() => {
    const initializeVisibility = (columnsMeta) => {
      const visibility = {}
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
      const [jobCardsTable, masterTable, productionTable, actualProductionTable] = await Promise.all([
        fetchJobCardsData(),
        fetchMasterData(),
        fetchProductionData(),
        fetchActualProductionData(),
      ])

      const jobCardDataRows = processGvizTable(jobCardsTable)
      const masterDataRows = processGvizTable(masterTable)
      const productionDataRows = processGvizTable(productionTable)
      const actualProductionDataRows = processGvizTable(actualProductionTable)

      // Create a map for actual production data using the same logic as production page
      const productionDataMap = new Map()
      actualProductionDataRows.forEach((row) => {
        const jobCardNo = String(row.B || "").trim()
        if (jobCardNo) {
          const materials = []
          const materialColumns = [
            "I",
            "J",
            "K",
            "L",
            "M",
            "N",
            "O",
            "P",
            "Q",
            "R",
            "S",
            "T",
            "U",
            "V",
            "W",
            "X",
            "Y",
            "Z",
            "AA",
            "AB",
            "AC",
            "AD",
            "AE",
            "AF",
            "AG",
            "AH",
            "AI",
            "AJ",
            "AK",
            "AL",
            "AM",
            "AN",
            "AO",
            "AP",
            "AQ",
            "AR",
            "AS",
            "AT",
            "AU",
            "AV",
          ]

          for (let i = 0; i < materialColumns.length; i += 2) {
            const name = row[materialColumns[i]]
            const quantity = row[materialColumns[i + 1]]
            if (name && String(name).trim()) {
              materials.push({ name: String(name).trim(), quantity: quantity || 0 })
            }
          }

          productionDataMap.set(jobCardNo, {
            jobCardNo: jobCardNo,
            machineHours: String(row.AW || "-").trim(),
            rawMaterials: materials,
          })
        }
      })

      // Filter pending tests: Column AE filled and AF empty
      const pendingData = jobCardDataRows
        .filter(
          (row) => row.AE !== null && String(row.AE).trim() !== "" && (row.AF === null || String(row.AF).trim() === ""),
        )
        .map((row) => {
          const jobCardNo = String(row.B || "")
          const deliveryOrderNo = String(row.E || "")

          // Find production row by delivery order no
          const productionRow = productionDataRows.find(
            (prodRow) => String(prodRow.B || "").trim() === deliveryOrderNo.trim(),
          )

          // Get actual production data
          const productionData = productionDataMap.get(jobCardNo)

          return {
            _rowIndex: row._rowIndex,
            jobCardNo: jobCardNo,
            deliveryOrderNo: deliveryOrderNo,
            productName: String(row.G || ""),
            quantity: Number(row.H || 0),
            expectedDeliveryDate: productionRow?.G ? format(parseGvizDate(productionRow.G), "dd/MM/yyyy") : "",
            priority: String(productionRow?.H || ""),
            dateOfProduction: row.I ? format(parseGvizDate(row.I), "dd/MM/yyyy") : "",
            supervisorName: String(row.D || ""),
            shift: String(row.J || ""),
            rawMaterials: productionData ? productionData.rawMaterials : [],
            machineHours: productionData ? productionData.machineHours : "-",
            labTest1Status: String(row.V || "N/A"),
          }
        })

      setPendingTests(pendingData)

      // Filter history: Column AE filled and AF filled (Both tests complete)
      const historyData = jobCardDataRows
        .filter(
          (row) => row.AE !== null && String(row.AE).trim() !== "" && row.AF !== null && String(row.AF).trim() !== "",
        )
        .map((row) => {
          const completedAt = parseGvizDate(row.AF)
          const testDate = parseGvizDate(row.AJ)
          return {
            _rowIndex: row._rowIndex,
            jobCardNo: String(row.B || ""),
            deliveryOrderNo: String(row.E || ""),
            quantity: Number(row.H || 0),
            test1Status: String(row.V || "N/A"),
            dateOfTest2: testDate ? format(testDate, "dd/MM/yyyy") : String(row.AJ || ""),
            testedBy: String(row.AI || ""),
            test2Status: String(row.AH || "N/A"),
            bdAt110: String(row.AK || ""),
            ccsAt1100: String(row.AN || ""),
            ccsAt100: String(row.AL || ""),
            plcAt1100: String(row.AO || ""),
            bdAt1100: String(row.AM || ""),
            test2CompletedAt: completedAt ? format(completedAt, "dd/MM/yy HH:mm") : String(row.AF),
          }
        })
        .sort((a, b) => new Date(b.test2CompletedAt).getTime() - new Date(a.test2CompletedAt).getTime())

      setHistoryTests(historyData)

      // Set options from master data
      const statuses = [...new Set(masterDataRows.map((row) => String(row.D || "")).filter(Boolean))]
      setStatusOptions(statuses)

      const testedByOpts = [...new Set(masterDataRows.map((row) => String(row.E || "")).filter(Boolean))]
      setTestedByOptions(testedByOpts)
    } catch (err) {
      console.error("Error in loadAllData:", err)
      setError(`Failed to load data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [fetchJobCardsData, fetchMasterData, fetchProductionData, fetchActualProductionData])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const validateForm = () => {
    const errors = {}
    if (!formData.testStatus) errors.testStatus = "Status is required."
    if (!formData.dateOfTest) errors.dateOfTest = "Date of Test is required."
    if (!formData.testedBy) errors.testedBy = "Tested By is required."
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleOpenLabTesting = (test) => {
    setSelectedTest(test)
    setFormData(initialFormState)
    setFormErrors({})
    setIsDialogOpen(true)
  }

  const handleSaveLabTest = async () => {
    if (!validateForm() || !selectedTest) return

    setIsSubmitting(true)
    try {
      const timestamp = format(new Date(), "dd/MM/yyyy HH:mm:ss")
      const columnUpdates = {
        [LAB_TEST_2_COLUMNS.test2CompletedAt]: timestamp,
        [LAB_TEST_2_COLUMNS.testStatus]: formData.testStatus,
        [LAB_TEST_2_COLUMNS.testedBy]: formData.testedBy,
        [LAB_TEST_2_COLUMNS.dateOfTest]: format(formData.dateOfTest, "dd/MM/yyyy"),
        [LAB_TEST_2_COLUMNS.bdAt110]: formData.bdAt110,
        [LAB_TEST_2_COLUMNS.ccsAt100]: formData.ccsAt100,
        [LAB_TEST_2_COLUMNS.bdAt1100]: formData.bdAt1100,
        [LAB_TEST_2_COLUMNS.ccsAt1100]: formData.ccsAt1100,
        [LAB_TEST_2_COLUMNS.plcAt1100]: formData.plcAt1100,
      }

      const body = new URLSearchParams({
        sheetName: JOBCARDS_SHEET,
        action: "updateByJobCard",
        jobCardNo: selectedTest.jobCardNo.trim().toUpperCase(),
        columnUpdates: JSON.stringify(columnUpdates),
      })

      const res = await fetch(WEB_APP_URL, {
        method: "POST",
        body: body,
      })
      const result = await res.json()

      if (!result.success) {
        throw new Error(result.error || "Failed to update Lab Test 2 data in JobCards sheet.")
      }

      alert("Lab Test 2 data saved successfully!")
      setIsDialogOpen(false)
      await loadAllData()
    } catch (err) {
      setError(err.message)
      alert(`Error: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleColumn = (tab, dataKey, checked) => {
    const setter = tab === "pending" ? setVisiblePendingColumns : setVisibleHistoryColumns
    setter((prev) => ({ ...prev, [dataKey]: checked }))
  }

  const handleSelectAllColumns = (tab, columnsMeta, checked) => {
    const newVisibility = {}
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

  const renderRawMaterials = (materials) => {
    if (!materials || materials.length === 0) return "-"

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

  const ColumnToggler = ({ tab, columnsMeta }) => (
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
            <TestTube2 className="h-6 w-6 text-purple-600" />
            Lab Testing: Physical Test 2
          </CardTitle>
          <CardDescription className="text-gray-700">
            Perform Physical Test 2 for items where Test 1 is complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full sm:w-[450px] grid-cols-2 mb-6">
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <TestTube2 className="h-4 w-4" /> Pending Tests
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

            <TabsContent value="pending">
              <Card className="shadow-sm border border-border">
                <CardHeader className="py-3 px-4 bg-purple-50 rounded-md p-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-md font-semibold text-foreground">
                      <TestTube2 className="h-5 w-5 text-primary mr-2" />
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
                          pendingTests.map((test, index) => (
                            <TableRow key={`${test.jobCardNo}-${index}`} className="hover:bg-purple-50/50">
                              {visiblePendingColumnsMeta.map((col) => (
                                <TableCell key={col.dataKey} className="whitespace-nowrap text-sm py-2 px-3">
                                  {col.dataKey === "actionColumn" ? (
                                    <Button
                                      size="sm"
                                      onClick={() => handleOpenLabTesting(test)}
                                      className="bg-purple-600 text-white hover:bg-purple-700"
                                    >
                                      <TestTube2 className="mr-2 h-4 w-4" />
                                      Perform Test 2
                                    </Button>
                                  ) : col.dataKey === "labTest1Status" ? (
                                    <Badge variant={test.labTest1Status === "Accepted" ? "default" : "destructive"}>
                                      {test.labTest1Status}
                                    </Badge>
                                  ) : col.dataKey === "rawMaterials" ? (
                                    renderRawMaterials(test.rawMaterials)
                                  ) : col.dataKey === "machineHours" ? (
                                    formatMachineHours(test[col.dataKey])
                                  ) : (
                                    test[col.dataKey] || "-"
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={visiblePendingColumnsMeta.length} className="h-48">
                              <div className="flex flex-col items-center justify-center text-center border-2 border-dashed border-purple-200/50 bg-purple-50/50 rounded-lg mx-4 my-4 flex-1">
                                <TestTube2 className="h-12 w-12 text-purple-500 mb-3" />
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

            <TabsContent value="history">
              <Card className="shadow-sm border border-border">
                <CardHeader className="py-3 px-4 bg-purple-50 rounded-md p-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-md font-semibold text-foreground">
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
                          historyTests.map((test, index) => (
                            <TableRow key={`${test.jobCardNo}-${index}`} className="hover:bg-purple-50/50">
                              {visibleHistoryColumnsMeta.map((col) => (
                                <TableCell key={col.dataKey} className="whitespace-nowrap text-sm">
                                  {col.dataKey === "test2Status" ? (
                                    <Badge variant={test.test2Status === "Pass" ? "default" : "destructive"}>
                                      {test.test2Status}
                                    </Badge>
                                  ) : col.dataKey === "test1Status" ? (
                                    <Badge variant={test.test1Status === "Accepted" ? "default" : "destructive"}>
                                      {test.test1Status}
                                    </Badge>
                                  ) : (
                                    test[col.dataKey] || "-"
                                  )}
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Physical Test 2 Details for JC: {selectedTest?.jobCardNo}</DialogTitle>
            <DialogDescription>Fill out the test results below. Fields with * are required.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSaveLabTest()
            }}
            className="space-y-4 pt-4"
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/50">
              <div>
                <Label className="text-xs">DO No.</Label>
                <p className="text-sm font-semibold">{selectedTest?.deliveryOrderNo}</p>
              </div>
              <div>
                <Label className="text-xs">Product</Label>
                <p className="text-sm font-semibold">{selectedTest?.productName}</p>
              </div>
              <div>
                <Label className="text-xs">Test 1 Status</Label>
                <p className="text-sm font-semibold">{selectedTest?.labTest1Status}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                {formErrors.dateOfTest && <p className="text-xs text-red-600 mt-1">{formErrors.dateOfTest}</p>}
              </div>

              <div className="space-y-2">
                <Label>Test Status *</Label>
                <Select value={formData.testStatus} onValueChange={(v) => handleFormChange("testStatus", v)}>
                  <SelectTrigger className={formErrors.testStatus ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.testStatus && <p className="text-xs text-red-600 mt-1">{formErrors.testStatus}</p>}
              </div>

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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bdAt110">BD At 110°C</Label>
                <Input
                  id="bdAt110"
                  type="number"
                  step="0.01"
                  value={formData.bdAt110}
                  onChange={(e) => handleFormChange("bdAt110", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ccsAt100">CCS At 100°C</Label>
                <Input
                  id="ccsAt100"
                  type="number"
                  step="0.1"
                  value={formData.ccsAt100}
                  onChange={(e) => handleFormChange("ccsAt100", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bdAt1100">BD At 1100°C</Label>
                <Input
                  id="bdAt1100"
                  type="number"
                  step="0.01"
                  value={formData.bdAt1100}
                  onChange={(e) => handleFormChange("bdAt1100", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ccsAt1100">CCS At 1100°C</Label>
                <Input
                  id="ccsAt1100"
                  type="number"
                  step="0.1"
                  value={formData.ccsAt1100}
                  onChange={(e) => handleFormChange("ccsAt1100", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="plcAt1100">PLC At 1100°C</Label>
                <Input
                  id="plcAt1100"
                  type="number"
                  step="0.1"
                  value={formData.plcAt1100}
                  onChange={(e) => handleFormChange("plcAt1100", e.target.value)}
                />
              </div>
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
