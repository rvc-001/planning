"use client"
import type React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Loader2,
  AlertTriangle,
  PackageCheck,
  TrendingUp,
  Factory,
  ClipboardList,
  ClipboardCheck,
  FileText,
  RefreshCw,
  Filter,
  Calendar as CalendarIcon,
  Eye,
} from "lucide-react"
import { format, parse } from "date-fns"
// Shadcn UI components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"

// --- CONSTANTS ---
const SHEET_ID = "1niKq7rnnWdkH5gWXJIiVJQEsUKgK8qdjLokbo0rmt48"
const ORDERS_SHEET = "Orders"
const PRODUCTION_SHEET = "Production"
const MASTER_SHEET = "Master"
const COSTING_RESPONSE_SHEET = "Costing Response"
const JOBCARDS_SHEET = "JobCards"
const ACTUAL_PRODUCTION_SHEET = "Actual Production"

// --- STYLING ---
const COLORS = {
  primary: "#8B5CF6", // Light Purple (Violet 500)
}

const PRIORITY_BADGE_VARIANT: { [key: string]: "default" | "destructive" | "secondary" } = {
  Urgent: "destructive",
  High: "secondary",
  Normal: "default",
}


// --- INTERFACES ---
interface AllOrdersRecord {
  id: string
  timestamp: string
  timestampObj: Date | null
  firmName: string
  partyName: string
  orderNo: string
  productName: string
}

interface ProductionOrderRecord {
  id: string
  timestamp: string
  timestampObj: Date | null
  deliveryOrderNo: string
  partyName: string
  productName: string
  orderQuantity: number
  expectedDeliveryDate: string
  deliveryDateObj: Date | null
  priority: string
  note: string
  status: string
}

interface KittingHistoryRecord {
  id: string
  timestamp: string
  timestampObj: Date | null
  compositionNumber: string
  deliveryOrderNo: string
  productName: string
  sellingPrice: number
  gpPercentage: string
  rawMaterials: { name: string; quantity: number | string }[]
}

interface ActualProductionRecord {
  id: string
  timestamp: string
  timestampObj: Date | null
  jobCardNo: string
  firmName: string
  dateOfProduction: string
  supervisorName: string
  productName: string
  quantityFG: number
  serialNumber: string
  machineHours: string
  rawMaterials: { name: string; quantity: number | string }[]
  status: string
}

interface JobCardRecord {
  id: string
  timestamp: string
  timestampObj: Date | null
  jobCardNo: string
  firmName: string
  supervisorName: string
  deliveryOrderNo: string
  partyName: string
  productName: string
  orderQuantity: number
  dateOfProduction: string
  dateOfProductionObj: Date | null
  shift: string
  note: string
  status: string
}

interface MasterData {
  firmNames: string[]
  partyNames: string[]
  orderNumbers: string[]
  products: string[]
  priorities: string[]
  supervisors: string[]
}

// --- CUSTOM HOOK for data fetching ---
const useProductionData = () => {
  const [allOrders, setAllOrders] = useState<AllOrdersRecord[]>([])
  const [productionOrders, setProductionOrders] = useState<ProductionOrderRecord[]>([])
  const [actualProductionData, setActualProductionData] = useState<ActualProductionRecord[]>([])
  const [jobCardsData, setJobCardsData] = useState<JobCardRecord[]>([])
  const [kittingHistory, setKittingHistory] = useState<KittingHistoryRecord[]>([])
  const [masterData, setMasterData] = useState<MasterData>({
    firmNames: [],
    partyNames: [],
    orderNumbers: [],
    products: [],
    priorities: [],
    supervisors: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGoogleSheetData = async (sheetName: string) => {
    const response = await fetch(
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&headers=1`,
    )
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    const text = await response.text()
    const jsonText = text.substring(text.indexOf("(") + 1, text.lastIndexOf(")"))
    const json = JSON.parse(jsonText)
    if (json.status === "error") throw new Error(json.errors[0].detailed_message)
    return json.table
  }

  const processGvizTableByIndex = (table: any, startIndex = 0) => {
    if (!table || !table.rows || table.rows.length <= startIndex) return []
    const dataRows = table.rows.slice(startIndex)
    return dataRows
      .map((row: any) => {
        if (!row.c || row.c.every((cell: any) => !cell || cell.v === null || cell.v === "")) return null
        const rowData: { [key: string]: any } = {}
        row.c.forEach((cell: any, index: number) => {
          rowData[`col${index}`] = cell && cell.v !== null && cell.v !== undefined ? cell.v : ""
          if (cell && cell.f) {
            rowData[`col${index}_formatted`] = cell.f
          }
        })
        return rowData
      })
      .filter(Boolean)
  }

  const parseGvizDateTime = (gvizDate: string): Date | null => {
    if (!gvizDate || typeof gvizDate !== "string") return null
    try {
      const parsedDate = parse(gvizDate, "dd/MM/yyyy HH:mm:ss", new Date())
      if (!isNaN(parsedDate.getTime())) return parsedDate
    } catch (e) {}
    const dateTimeMatch = gvizDate.match(/Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/)
    if (dateTimeMatch) {
      const [, year, month, day, hours, minutes, seconds] = dateTimeMatch.map(Number)
      return new Date(year, month, day, hours, minutes, seconds)
    }
    const dateOnlyParts = gvizDate.split("/")
    if (dateOnlyParts.length === 3) {
      const day = parseInt(dateOnlyParts[0], 10)
      const month = parseInt(dateOnlyParts[1], 10) - 1
      const year = parseInt(dateOnlyParts[2], 10)
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) return new Date(year, month, day)
    }
    const dateOnlyMatch = gvizDate.match(/Date\((\d+),(\d+),(\d+)\)/)
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch.map(Number)
      return new Date(year, month, day)
    }
    return null
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [
        ordersTable,
        productionSheetTable,
        masterTable,
        costingResponseTable,
        jobCardsTable,
        actualProductionTable,
      ] = await Promise.all([
        fetchGoogleSheetData(ORDERS_SHEET),
        fetchGoogleSheetData(PRODUCTION_SHEET),
        fetchGoogleSheetData(MASTER_SHEET),
        fetchGoogleSheetData(COSTING_RESPONSE_SHEET),
        fetchGoogleSheetData(JOBCARDS_SHEET),
        fetchGoogleSheetData(ACTUAL_PRODUCTION_SHEET),
      ])

      const rawAllOrders = processGvizTableByIndex(ordersTable, 0)
      const rawProductionOrders = processGvizTableByIndex(productionSheetTable, 3)
      const rawMasterData = processGvizTableByIndex(masterTable, 0)
      const rawKittingHistory = processGvizTableByIndex(costingResponseTable, 0)
      const rawJobCards = processGvizTableByIndex(jobCardsTable, 0)
      const rawActualProduction = processGvizTableByIndex(actualProductionTable, 0)

      const processedAllOrders = rawAllOrders
        .map((row: any, index: number) => ({
          id: `all-orders-${index}`,
          timestamp: parseGvizDateTime(row["col0"]) ? format(parseGvizDateTime(row["col0"])!, "dd/MM/yyyy HH:mm:ss") : "N/A",
          timestampObj: parseGvizDateTime(row["col0"]),
          firmName: String(row["col0"] || ""),
          partyName: String(row["col1"] || ""),
          orderNo: String(row["col2"] || ""),
          productName: String(row["col3"] || ""),
        }))
        .filter((order) => order.firmName && order.firmName.trim() !== "")
        .sort((a, b) => (b.timestampObj?.getTime() ?? 0) - (a.timestampObj?.getTime() ?? 0))

      const processedProductionOrders = rawProductionOrders
        .map((row: any, index: number) => ({
          id: `prod-order-${index}`,
          timestamp: parseGvizDateTime(row["col0"]) ? format(parseGvizDateTime(row["col0"])!, "dd/MM/yyyy HH:mm:ss") : "N/A",
          timestampObj: parseGvizDateTime(row["col0"]),
          deliveryOrderNo: String(row["col1"] || ""),
          partyName: String(row["col3"] || ""),
          productName: String(row["col4"] || ""),
          orderQuantity: Number(row["col5"]) || 0,
          expectedDeliveryDate: row["col6_formatted"] || String(row["col6"] || ""),
          deliveryDateObj: parseGvizDateTime(String(row["col6"] || "")),
          priority: String(row["col7"] || "Normal"),
          note: String(row["col8"] || ""),
          status: String(row["col10"] || "Pending"),
        }))
        .filter((order) => order.deliveryOrderNo && order.deliveryOrderNo.trim() !== "")
        .sort((a, b) => (b.timestampObj?.getTime() ?? 0) - (a.timestampObj?.getTime() ?? 0))


      const processedKittingHistory = rawKittingHistory
        .map((row, index) => {
          const rawMaterials = []
          for (let i = 1; i <= 20; i++) {
            if (row[`col${14 + i}`]) {
              rawMaterials.push({ name: String(row[`col${14 + i}`]), quantity: Number(row[`col${34 + i}`]) || 0 })
            }
          }
          return {
            id: `kitting-hist-${index}`,
            timestamp: parseGvizDateTime(row["col0"]) ? format(parseGvizDateTime(row["col0"])!, "dd/MM/yyyy HH:mm:ss") : "N/A",
            timestampObj: parseGvizDateTime(row["col0"]),
            compositionNumber: String(row["col1"] || ""),
            deliveryOrderNo: String(row["col2"] || ""),
            productName: String(row["col3"] || ""),
            sellingPrice: Number(row["col9"] || 0),
            gpPercentage: String(row["col10"] || ""),
            rawMaterials: rawMaterials,
          }
        })
        .sort((a, b) => (b.timestampObj?.getTime() ?? 0) - (a.timestampObj?.getTime() ?? 0))

      const processedJobCards = rawJobCards
        .map((row, index) => ({
          id: `jc-${index}`,
          timestamp: parseGvizDateTime(row["col0"]) ? format(parseGvizDateTime(row["col0"])!, "dd/MM/yyyy HH:mm:ss") : "N/A",
          timestampObj: parseGvizDateTime(row["col0"]),
          jobCardNo: String(row["col1"] || ""),
          firmName: String(row["col2"] || ""),
          supervisorName: String(row["col3"] || ""),
          deliveryOrderNo: String(row["col4"] || ""),
          partyName: String(row["col5"] || ""),
          productName: String(row["col6"] || ""),
          orderQuantity: Number(row["col7"] || 0),
          dateOfProduction: parseGvizDateTime(String(row["col8"] || "")) ? format(parseGvizDateTime(String(row["col8"] || ""))!, "PPP") : "N/A",
          dateOfProductionObj: parseGvizDateTime(String(row["col8"] || "")),
          shift: String(row["col9"] || ""),
          note: String(row["col10"] || ""),
          status: String(row["col11"] || "Pending"),
        }))
        .filter((card) => card.timestampObj !== null && card.jobCardNo.startsWith("JC-"))
        .sort((a, b) => (b.timestampObj?.getTime() ?? 0) - (a.timestampObj?.getTime() ?? 0))

      const processedActualProduction = rawActualProduction
        .map((row, index) => {
          const rawMaterials = []
          for (let i = 8; i < 48; i += 2) {
            if (row[`col${i}`]) {
              rawMaterials.push({ name: String(row[`col${i}`]), quantity: Number(row[`col${i + 1}`]) || 0 })
            }
          }
          return {
            id: `ap-${index}`,
            timestamp: parseGvizDateTime(row["col0"]) ? format(parseGvizDateTime(row["col0"])!, "dd/MM/yyyy HH:mm:ss") : "N/A",
            timestampObj: parseGvizDateTime(row["col0"]),
            jobCardNo: String(row["col1"] || ""),
            firmName: String(row["col2"] || ""),
            dateOfProduction: row["col3_formatted"] || String(row["col3"] || ""),
            supervisorName: String(row["col4"] || ""),
            productName: String(row["col5"] || ""),
            quantityFG: Number(row["col6"] || 0),
            serialNumber: String(row["col7"] || ""),
            machineHours: row["col48_formatted"] || "00:00:00",
            rawMaterials: rawMaterials,
            status: String(row["col67"] || "Pending"),
          }
        })
        .filter((prod) => prod.timestampObj !== null && prod.jobCardNo.startsWith("JC-"))
        .sort((a, b) => (b.timestampObj?.getTime() ?? 0) - (a.timestampObj?.getTime() ?? 0))

      const getUniqueOptions = (data: any[], colIndex: number) => [...new Set(data.map((item) => String(item[`col${colIndex}`] || "")))].filter(Boolean);
      const firmNames = [...new Set(processedAllOrders.map(o => o.firmName))].filter(Boolean);
      const partyNames = [...new Set(processedAllOrders.map(o => o.partyName))].filter(Boolean);
      const orderNumbers = [...new Set(processedAllOrders.map(o => o.orderNo))]
                            .filter(Boolean)
                            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      const products = [...new Set(processedAllOrders.map(o => o.productName))].filter(Boolean);
      const priorities = getUniqueOptions(rawMasterData, 0);
      const supervisors = getUniqueOptions(rawMasterData, 1);

      setAllOrders(processedAllOrders)
      setProductionOrders(processedProductionOrders)
      setActualProductionData(processedActualProduction)
      setJobCardsData(processedJobCards)
      setKittingHistory(processedKittingHistory)
      setMasterData({ firmNames, partyNames, orderNumbers, products, priorities, supervisors })
    } catch (err: any) {
      setError(`Failed to load data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { allOrders, productionOrders, actualProductionData, jobCardsData, kittingHistory, masterData, loading, error, refetch: fetchData }
}

// --- MAIN DASHBOARD COMPONENT ---
export default function ProductionDashboard() {
  const { allOrders, productionOrders, actualProductionData, jobCardsData, kittingHistory, masterData, loading, error, refetch } = useProductionData()
  const [activeTab, setActiveTab] = useState("overview")
  const [viewingKittingDetails, setViewingKittingDetails] = useState<KittingHistoryRecord | null>(null)
  const [viewingProductionMaterials, setViewingProductionMaterials] = useState<ActualProductionRecord | null>(null)

  // --- FILTER STATES ---
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()
  const [firmName, setFirmName] = useState<string>("")
  const [partyName, setPartyName] = useState<string>("")
  const [productName, setProductName] = useState<string>("")
  const [orderNo, setOrderNo] = useState<string>("")
  const [priority, setPriority] = useState<string>("")
  const [supervisor, setSupervisor] = useState<string>("")

  const filteredProductionOrders = useMemo(() => {
    return productionOrders.filter((o) => {
      const dateMatch = (() => {
        if (!startDate && !endDate) return true
        if (!o.deliveryDateObj) return false
        if (startDate && o.deliveryDateObj < startDate) return false
        if (endDate && o.deliveryDateObj > endDate) return false
        return true
      })()
      return (
        dateMatch &&
        (!partyName || o.partyName === partyName) &&
        (!productName || o.productName === productName) &&
        (!priority || o.priority === priority) &&
        (!orderNo || o.deliveryOrderNo === orderNo)
      )
    })
  }, [productionOrders, partyName, productName, priority, orderNo, startDate, endDate])

  const filteredKittingHistory = useMemo(() => {
    return kittingHistory.filter(k => {
        return (!orderNo || k.deliveryOrderNo === orderNo) &&
               (!productName || k.productName === productName)
    })
  }, [kittingHistory, orderNo, productName])

  const filteredJobCards = useMemo(() => {
    return jobCardsData.filter((jc) => {
      const dateMatch = (() => {
        if (!startDate && !endDate) return true
        if (!jc.dateOfProductionObj) return false
        if (startDate && jc.dateOfProductionObj < startDate) return false
        if (endDate && jc.dateOfProductionObj > endDate) return false
        return true
      })()
      return (
        dateMatch &&
        (!firmName || jc.firmName === firmName) &&
        (!partyName || jc.partyName === partyName) &&
        (!orderNo || jc.deliveryOrderNo === orderNo) &&
        (!supervisor || jc.supervisorName === supervisor) &&
        (!productName || jc.productName === productName)
      )
    })
  }, [jobCardsData, firmName, partyName, orderNo, supervisor, productName, startDate, endDate])

  const filteredProduction = useMemo(() => {
    return actualProductionData.filter((p) => {
      return (
        (!firmName || p.firmName === firmName) &&
        (!supervisor || p.supervisorName === supervisor) &&
        (!productName || p.productName === productName)
      )
    })
  }, [actualProductionData, firmName, supervisor, productName])

  // --- DASHBOARD METRICS ---
  const dashboardMetrics = useMemo(() => {
    const totalOrdersRecieved = allOrders.length
    const totalOrdersProcessed = productionOrders.length
    const totalPendingOrders = totalOrdersRecieved - totalOrdersProcessed
    const jobCardsCreated = jobCardsData.length
    return { totalOrdersRecieved, totalOrdersProcessed, totalPendingOrders, jobCardsCreated }
  }, [allOrders, productionOrders, jobCardsData])

  // --- CHART DATA ---
  const topPartiesChartData = useMemo(() => {
    if (!productionOrders.length) return []
    const partyCounts = productionOrders.reduce((acc, order) => {
      if (order.partyName) {
        acc[order.partyName] = (acc[order.partyName] || 0) + 1
      }
      return acc
    }, {} as { [key: string]: number })
    return Object.entries(partyCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))
  }, [productionOrders])

  const handleResetFilters = () => {
    setStartDate(undefined)
    setEndDate(undefined)
    setFirmName("")
    setPartyName("")
    setProductName("")
    setOrderNo("")
    setPriority("")
    setSupervisor("")
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-violet-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700">Loading Production Dashboard</h2>
          <p className="text-slate-500">Fetching the latest data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50">
         <div className="p-8 text-center bg-white border border-red-200 text-red-700 rounded-2xl shadow-lg max-w-md mx-auto">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <p className="text-2xl font-bold">Error Loading Data</p>
          <p className="text-sm text-slate-600 mt-2 mb-6">{error}</p>
          <Button onClick={refetch} className="bg-violet-500 text-white hover:bg-violet-600">
            <RefreshCw className="w-4 h-4 mr-2" /> Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200 px-8 py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-violet-600">Production Planning Dashboard</h1>
            <p className="text-sm text-slate-500">Real-time operational overview</p>
          </div>
          <Button variant="outline" size="sm" onClick={refetch} className="text-violet-600 border-violet-300 hover:bg-violet-50 hover:text-violet-600">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh Data
          </Button>
        </div>
      </header>
      <main className="p-8">
        <Card className="shadow-lg shadow-slate-200/50 border-slate-200/80 mb-8 bg-white rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-violet-600">
              <Filter className="h-6 w-6" />
              <span className="text-xl">Filter & Search</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 mb-4">
               <SelectWithLabel
                label="Firm Name"
                placeholder="All Firms"
                value={firmName}
                onValueChange={setFirmName}
                options={masterData.firmNames}
              />
              <SelectWithLabel
                label="Party Name"
                placeholder="All Parties"
                value={partyName}
                onValueChange={setPartyName}
                options={masterData.partyNames}
              />
               <SelectWithLabel
                label="Order No."
                placeholder="All Orders"
                value={orderNo}
                onValueChange={setOrderNo}
                options={masterData.orderNumbers}
              />
              <SelectWithLabel
                label="Product Name"
                placeholder="All Products"
                value={productName}
                onValueChange={setProductName}
                options={masterData.products}
              />
              <DatePickerWithLabel label="Start Date" date={startDate} setDate={setStartDate} placeholder="Start date" />
              <DatePickerWithLabel label="End Date" date={endDate} setDate={setEndDate} placeholder="End date" />
              <SelectWithLabel
                label="Priority"
                placeholder="All Priorities"
                value={priority}
                onValueChange={setPriority}
                options={masterData.priorities}
              />
              <SelectWithLabel
                label="Supervisor"
                placeholder="All Supervisors"
                value={supervisor}
                onValueChange={setSupervisor}
                options={masterData.supervisors}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={handleResetFilters} className="text-violet-600 hover:bg-violet-100 hover:text-violet-700">
                Reset Filters
              </Button>
            </div>
          </CardContent>
        </Card>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 h-12 p-1 bg-violet-100/90 rounded-xl">
            <TabsTrigger value="overview">
              <TrendingUp className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="orders">
              <ClipboardList className="w-4 h-4 mr-2" />
              Production Orders
            </TabsTrigger>
            <TabsTrigger value="kitting">
              <ClipboardCheck className="w-4 h-4 mr-2" />
              Full Kitting
            </TabsTrigger>
            <TabsTrigger value="job-cards">
              <FileText className="w-4 h-4 mr-2" />
              Job Cards
            </TabsTrigger>
            <TabsTrigger value="production">
              <Factory className="w-4 h-4 mr-2" />
              Actual Production
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <KpiCard title="Total Orders Recieved" value={dashboardMetrics.totalOrdersRecieved} icon={<PackageCheck size={20}/>} />
              <KpiCard title="Total Orders Processed" value={dashboardMetrics.totalOrdersProcessed} icon={<Factory size={20} />} />
              <KpiCard title="Total Pending Orders" value={dashboardMetrics.totalPendingOrders} icon={<ClipboardList size={20} />} />
              <KpiCard title="Job Cards Created" value={dashboardMetrics.jobCardsCreated} icon={<FileText size={20} />} />
            </div>
            <Card className="bg-white shadow-lg shadow-slate-200/50 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-violet-600">Top 5 Parties by Order Volume</CardTitle>
                <CardDescription>Shows which parties have the most production orders.</CardDescription>
              </CardHeader>
              <CardContent className="h-[350px] p-2 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topPartiesChartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} stroke="#94a3b8" fontSize={12}/>
                    <YAxis dataKey="name" type="category" width={100} interval={0} stroke="#94a3b8" fontSize={12}/>
                    <Tooltip 
                      cursor={{ fill: 'rgba(139, 92, 246, 0.05)' }} 
                      contentStyle={{
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.75rem',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Bar dataKey="count" name="Number of Orders" fill={COLORS.primary} barSize={25} radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="orders">
            <DataTable
              title="Production Orders"
              description="All orders scheduled for production, sorted from newest to oldest."
              data={filteredProductionOrders}
              columns={[
                { key: "deliveryOrderNo", header: "Delivery Order No." },
                { key: "partyName", header: "Party Name" },
                { key: "productName", header: "Product Name" },
                { key: "orderQuantity", header: "Order Qty" },
                { key: "expectedDeliveryDate", header: "Expected Delivery" },
                {
                  key: "priority",
                  header: "Priority",
                  render: (item) => (
                    <Badge variant={PRIORITY_BADGE_VARIANT[item.priority] || 'default'}>{item.priority}</Badge>
                  ),
                },
                { key: "note", header: "Note" },
              ]}
            />
          </TabsContent>
          <TabsContent value="kitting">
            <DataTable
              title="Full Kitting History"
              description="Records of all verified kitting compositions, sorted from latest to oldest."
              data={filteredKittingHistory}
              columns={[
                { key: "timestamp", header: "Verified At" },
                { key: "compositionNumber", header: "Composition No." },
                { key: "deliveryOrderNo", header: "Delivery Order No." },
                { key: "productName", header: "Product Name" },
                { key: "sellingPrice", header: "Selling Price", render: (item) => `₹${item.sellingPrice.toFixed(2)}` },
                { key: "gpPercentage", header: "GP %" },
                {
                  key: "rawMaterials",
                  header: "Raw Materials",
                  render: (item) => (
                    <Button variant="outline" size="sm" className="h-8 text-violet-600 border-violet-300 hover:bg-violet-50 hover:text-violet-600" onClick={() => setViewingKittingDetails(item)}>
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      View ({item.rawMaterials.length})
                    </Button>
                  ),
                },
              ]}
            />
          </TabsContent>
          <TabsContent value="job-cards">
            <DataTable
              title="Job Card History"
              description="All created job cards, sorted from newest to oldest."
              data={filteredJobCards}
              columns={[
                { key: "timestamp", header: "Timestamp" },
                { key: "jobCardNo", header: "Job Card No." },
                { key: "firmName", header: "Firm Name" },
                { key: "supervisorName", header: "Supervisor" },
                { key: "deliveryOrderNo", header: "Delivery Order No." },
                { key: "partyName", header: "Party Name" },
                { key: "productName", header: "Product" },
                { key: "orderQuantity", header: "Quantity" },
                { key: "dateOfProduction", header: "Prod. Date" },
                { key: "shift", header: "Shift" },
                { key: "note", header: "Note" },
              ]}
            />
          </TabsContent>
          <TabsContent value="production">
            <DataTable
              title="Actual Production History"
              description="Records of all actual production runs, sorted from latest to oldest."
              data={filteredProduction}
              columns={[
                { key: "timestamp", header: "Timestamp" },
                { key: "jobCardNo", header: "Job Card No." },
                { key: "firmName", header: "Firm Name" },
                { key: "dateOfProduction", header: "Prod. Date" },
                { key: "supervisorName", header: "Supervisor" },
                { key: "productName", header: "Product Name" },
                { key: "quantityFG", header: "Quantity FG" },
                { key: "serialNumber", header: "Serial No." },
                { key: "machineHours", header: "Machine Hours" },
                {
                  key: "rawMaterials",
                  header: "Raw Materials",
                  render: (item) => (
                    <Button variant="outline" size="sm" className="h-8 text-violet-600 border-violet-300 hover:bg-violet-50 hover:text-violet-600" onClick={() => setViewingProductionMaterials(item)}>
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      View ({item.rawMaterials.length})
                    </Button>
                  ),
                },
              ]}
            />
          </TabsContent>
        </Tabs>
        <Dialog open={!!viewingKittingDetails} onOpenChange={(isOpen) => !isOpen && setViewingKittingDetails(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-violet-600">Raw Material Details: {viewingKittingDetails?.compositionNumber}</DialogTitle>
              <DialogDescription>A detailed breakdown of all raw materials for this kitting record.</DialogDescription>
            </DialogHeader>
            <div className="mt-4 max-h-[60vh] overflow-y-auto pr-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Raw Material Name</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewingKittingDetails?.rawMaterials.map((material, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{material.name}</TableCell>
                      <TableCell className="text-right">{material.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={!!viewingProductionMaterials} onOpenChange={(isOpen) => !isOpen && setViewingProductionMaterials(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-violet-600">Raw Material Details: {viewingProductionMaterials?.jobCardNo}</DialogTitle>
              <DialogDescription>A detailed breakdown of all raw materials for this production run.</DialogDescription>
            </DialogHeader>
            <div className="mt-4 max-h-[60vh] overflow-y-auto pr-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Raw Material Name</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewingProductionMaterials?.rawMaterials.map((material, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{material.name}</TableCell>
                      <TableCell className="text-right">{material.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}

// --- HELPER COMPONENTS ---
const KpiCard = ({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode;}) => (
  <Card className="bg-white shadow-lg shadow-slate-200/50 rounded-2xl transition-all hover:shadow-violet-100 hover:-translate-y-1">
    <CardHeader className="pb-2">
      <div className="flex items-start justify-between">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        <div className="p-2 bg-violet-50 rounded-lg text-violet-500">{icon}</div>
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold text-slate-800">{value}</div>
    </CardContent>
  </Card>
)

const SelectWithLabel = ({ label, value, onValueChange, placeholder, options }: { label: string; value: string; onValueChange: (value: string) => void; placeholder: string; options: string[] }) => (
  <div className="space-y-2">
    <Label className="text-sm font-medium text-slate-700">{label}</Label>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full bg-white h-10 border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)

const DatePickerWithLabel = ({ label, date, setDate, placeholder }: { label: string; date: Date | undefined; setDate: (date: Date | undefined) => void; placeholder: string }) => (
  <div className="space-y-2">
    <Label className="text-sm font-medium text-slate-700">{label}</Label>
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal h-10 rounded-lg border-slate-300", !date && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
      </PopoverContent>
    </Popover>
  </div>
)

const DataTable = ({ title, description, data, columns }: { title: string; description: string; data: any[]; columns: { key: string; header: string; render?: (item: any) => React.ReactNode }[] }) => (
  <Card className="bg-white shadow-lg shadow-slate-200/50 rounded-2xl overflow-hidden">
    <CardHeader>
      <CardTitle className="text-violet-600">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="border rounded-xl">
        <ScrollArea className="h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-slate-50 z-10">
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key} className="text-slate-600 font-semibold">{col.header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length > 0 ? (
                data.map((item, index) => (
                  <TableRow key={item.id || index} className="hover:bg-slate-50/70 transition-colors">
                    {columns.map((col) => (
                      <TableCell key={col.key} className="py-3 text-sm text-slate-600">
                        {col.render ? col.render(item) : item[col.key]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">
                    No results found for your current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </CardContent>
  </Card>
)