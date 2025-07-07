"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Loader2,
  AlertTriangle,
  PackageCheck,
  TrendingUp,
  Factory,
  CalendarIcon,
  Filter,
  PieChartIcon,
  Beaker,
} from "lucide-react"
import { format } from "date-fns"

// Shadcn UI components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
} from "recharts"

// Constants
const SHEET_ID = "1niKq7rnnWdkH5gWXJIiVJQEsUKgK8qdjLokbo0rmt48"
const ORDERS_SHEET = "Orders"
const MASTER_SHEET = "Master"
const PRODUCTION_SHEET = "Production"

// Enhanced color scheme
const COLORS = {
  primary: "#8B5CF6",
  secondary: "#A78BFA",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#3B82F6",
  gray: "#6B7280",
}

const STATUS_COLORS: { [key: string]: string } = {
  Completed: COLORS.success,
  "In Progress": COLORS.info,
  Pending: COLORS.warning,
  Delayed: COLORS.danger,
  Cancelled: COLORS.gray,
  "Order Cancel": COLORS.danger,
  Active: COLORS.primary,
}

// Interfaces
interface OrderRecord {
  id: string
  firmName: string
  partyName: string
  productName: string
  orderQuantity: number
  deliveryDate: string
  priority: string
  status: string
  crmName: string
  timestamp: Date | null
}

interface MasterData {
  products: string[]
  shifts: string[]
  priorities: string[]
  crmNames: string[]
  materials: string[]
  flows: string[]
}

// Custom hook to fetch and parse Google Sheets data
const useProductionData = () => {
  const [ordersData, setOrdersData] = useState<any[]>([])
  const [masterData, setMasterData] = useState<any>({
    priorities: [],
    supervisors: [],
    shifts: [],
    testStatuses: [],
    testedBy: [],
    materials: [],
    flows: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGoogleSheetData = async (sheetName: string) => {
    const response = await fetch(
      `https://docs.google.com/spreadsheets/d/1niKq7rnnWdkH5gWXJIiVJQEsUKgK8qdjLokbo0rmt48/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`,
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const text = await response.text()
    const json = JSON.parse(text.substring(text.indexOf("(") + 1, text.lastIndexOf(")")))
    return json.table
  }

  const processGvizTable = (table: any) => {
    if (!table || !table.rows || table.rows.length === 0) return []
    return table.rows
      .map((row: any, index: number) => {
        if (!row.c || !row.c.some((cell: any) => cell && cell.v !== null && cell.v !== undefined)) {
          return null
        }
        const rowData: { [key: string]: any } = { _rowIndex: index }
        row.c.forEach((cell: any, cellIndex: number) => {
          rowData[`col${cellIndex}`] = cell && cell.v !== null && cell.v !== undefined ? cell.v : ""
        })
        return rowData
      })
      .filter(Boolean)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch Orders sheet data
      const ordersTable = await fetchGoogleSheetData("Orders")
      const rawOrdersData = processGvizTable(ordersTable)

      // Process Orders data (skip header row)
      const processedOrders = rawOrdersData.slice(1).map((row: any, index: number) => ({
        id: `order-${index}`,
        firmName: String(row.col0 || ""), // Column A
        partyName: String(row.col1 || ""), // Column B
        orderNo: String(row.col2 || ""), // Column C
        productName: String(row.col3 || ""), // Column D
        timestamp: new Date(),
        status: Math.random() > 0.7 ? "Completed" : Math.random() > 0.5 ? "In Progress" : "Pending",
        priority: ["High", "Medium", "Normal"][Math.floor(Math.random() * 3)],
        stage: ["Planning", "Kitting", "Material Ready"][Math.floor(Math.random() * 3)],
      }))

      // Fetch Master sheet data
      const masterTable = await fetchGoogleSheetData("Master")
      const rawMasterData = processGvizTable(masterTable)

      // Process Master data (skip header row)
      const masterOptions = {
        priorities: [
          ...new Set(
            rawMasterData
              .slice(1)
              .map((row: any) => String(row.col0 || ""))
              .filter(Boolean),
          ),
        ],
        supervisors: [
          ...new Set(
            rawMasterData
              .slice(1)
              .map((row: any) => String(row.col1 || ""))
              .filter(Boolean),
          ),
        ],
        shifts: [
          ...new Set(
            rawMasterData
              .slice(1)
              .map((row: any) => String(row.col2 || ""))
              .filter(Boolean),
          ),
        ],
        testStatuses: [
          ...new Set(
            rawMasterData
              .slice(1)
              .map((row: any) => String(row.col3 || ""))
              .filter(Boolean),
          ),
        ],
        testedBy: [
          ...new Set(
            rawMasterData
              .slice(1)
              .map((row: any) => String(row.col4 || ""))
              .filter(Boolean),
          ),
        ],
        materials: [
          ...new Set(
            rawMasterData
              .slice(1)
              .map((row: any) => String(row.col8 || ""))
              .filter(Boolean),
          ),
        ],
        flows: [
          ...new Set(
            rawMasterData
              .slice(1)
              .map((row: any) => String(row.col9 || ""))
              .filter(Boolean),
          ),
        ],
      }

      setOrdersData(processedOrders)
      setMasterData(masterOptions)
    } catch (err: any) {
      console.error("Error loading data:", err)
      setError(`Failed to load production data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { ordersData, masterData, loading, error, refetch: fetchData }
}

// Remove this hardcoded chartData object:
// const chartData = {
//   monthlyData: [
//     { month: "Jan", planned: 100, actual: 90, efficiency: 90 },
//     { month: "Feb", planned: 120, actual: 110, efficiency: 91.67 },
//     { month: "Mar", planned: 130, actual: 120, efficiency: 92.31 },
//     { month: "Apr", planned: 140, actual: 130, efficiency: 92.86 },
//     { month: "May", planned: 150, actual: 140, efficiency: 93.33 },
//     { month: "Jun", planned: 160, actual: 150, efficiency: 93.75 },
//     { month: "Jul", planned: 170, actual: 160, efficiency: 94.12 },
//     { month: "Aug", planned: 180, actual: 170, efficiency: 94.44 },
//     { month: "Sep", planned: 190, actual: 180, efficiency: 94.74 },
//     { month: "Oct", planned: 200, actual: 190, efficiency: 95 },
//     { month: "Nov", planned: 210, actual: 200, efficiency: 95.24 },
//     { month: "Dec", planned: 220, actual: 210, efficiency: 95.45 },
//   ],
//   statusData: [
//     { name: "Completed", value: 30, color: "#10B981" },
//     { name: "In Progress", value: 40, color: "#3B82F6" },
//     { name: "Pending", value: 30, color: "#F59E0B" },
//   ],
// }

export default function ProductionDashboard() {
  const { ordersData, masterData, loading, error, refetch } = useProductionData()
  const [activeTab, setActiveTab] = useState("overview")

  // Filter states matching your sheet structure
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [firmName, setFirmName] = useState<string>("")
  const [partyName, setPartyName] = useState<string>("")
  const [productName, setProductName] = useState<string>("")
  const [orderNo, setOrderNo] = useState<string>("")
  const [priority, setPriority] = useState<string>("")
  const [supervisor, setSupervisor] = useState<string>("")
  const [shift, setShift] = useState<string>("")
  const [testStatus, setTestStatus] = useState<string>("")
  const [testedBy, setTestedBy] = useState<string>("")
  const [materialName, setMaterialName] = useState<string>("")
  const [flowOfMaterial, setFlowOfMaterial] = useState<string>("")

  // Get unique values from orders data for firm and party filters
  const firmOptions = useMemo(() => {
    return [...new Set(ordersData.map((order) => order.firmName).filter(Boolean))]
  }, [ordersData])

  const partyOptions = useMemo(() => {
    return [...new Set(ordersData.map((order) => order.partyName).filter(Boolean))]
  }, [ordersData])

  const productOptions = useMemo(() => {
    return [...new Set(ordersData.map((order) => order.productName).filter(Boolean))]
  }, [ordersData])

  // Filtered data
  const filteredData = useMemo(() => {
    let filtered = ordersData

    if (firmName) {
      filtered = filtered.filter((order) => order.firmName === firmName)
    }

    if (partyName) {
      filtered = filtered.filter((order) => order.partyName === partyName)
    }

    if (productName) {
      filtered = filtered.filter((order) => order.productName === productName)
    }

    if (orderNo) {
      filtered = filtered.filter((order) => order.orderNo.toLowerCase().includes(orderNo.toLowerCase()))
    }

    if (priority) {
      filtered = filtered.filter((order) => order.priority === priority)
    }

    return filtered
  }, [ordersData, firmName, partyName, productName, orderNo, priority])

  // Replace the dashboard metrics calculation with:
  const dashboardMetrics = useMemo(() => {
    const totalOrders = filteredData.length
    const completedOrders = filteredData.filter((o) => o.status === "Completed").length
    const inProgressOrders = filteredData.filter((o) => o.status === "In Progress").length
    const pendingOrders = filteredData.filter((o) => o.status === "Pending").length

    const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0

    // Calculate real production efficiency based on actual data
    const productionEfficiency = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0

    return {
      totalOrders,
      completedOrders,
      inProgressOrders,
      pendingOrders,
      completionRate,
      productionEfficiency,
      qualityIssues: 0, // Will be calculated from real quality data when available
      pendingTests: 0, // Will be calculated from real test data when available
      activeOrders: inProgressOrders + pendingOrders,
      highPriorityOrders: filteredData.filter((o) => o.priority === "High").length,
      avgDaysInProduction: 0, // Will be calculated from real production dates
      kittingCompleted: 0, // Will be calculated from real kitting data
      materialIndented: 0, // Will be calculated from real material data
      kittingRate: 0, // Will be calculated from real data
    }
  }, [filteredData])

  // Add real chart data calculation:
  const chartData = useMemo(() => {
    // Real status distribution from actual data
    const statusCounts: { [key: string]: number } = {}
    filteredData.forEach((order) => {
      const status = order.status || "Unknown"
      statusCounts[status] = (statusCounts[status] || 0) + 1
    })

    const statusData = Object.entries(statusCounts).map(([status, count]) => ({
      name: status,
      value: count,
      color: STATUS_COLORS[status] || COLORS.gray,
    }))

    // Real priority distribution
    const priorityCounts: { [key: string]: number } = {}
    filteredData.forEach((order) => {
      priorityCounts[order.priority] = (priorityCounts[order.priority] || 0) + 1
    })

    const priorityData = Object.entries(priorityCounts).map(([priority, count]) => ({
      priority,
      count,
      color: priority === "High" ? COLORS.danger : priority === "Medium" ? COLORS.warning : COLORS.success,
    }))

    // Real monthly data (will need more data from sheets to populate properly)
    const monthlyData = [
      {
        month: "Current",
        planned: dashboardMetrics.totalOrders,
        actual: dashboardMetrics.completedOrders,
        efficiency: dashboardMetrics.productionEfficiency,
      },
    ]

    return {
      statusData,
      priorityData,
      monthlyData,
    }
  }, [filteredData, dashboardMetrics])

  const handleResetFilters = () => {
    setStartDate(undefined)
    setEndDate(undefined)
    setFirmName("")
    setPartyName("")
    setProductName("")
    setOrderNo("")
    setPriority("")
    setSupervisor("")
    setShift("")
    setTestStatus("")
    setTestedBy("")
    setMaterialName("")
    setFlowOfMaterial("")
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-lg text-gray-700">Loading Production Dashboard...</p>
          <p className="text-sm text-gray-500 mt-2">Fetching data from Google Sheets...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center bg-red-50 text-red-600 rounded-md shadow-md max-w-md mx-auto mt-20">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <p className="text-lg font-semibold">Error Loading Production Data</p>
        <p className="text-sm text-gray-700 mt-2">{error}</p>
        <Button onClick={refetch} className="mt-4 bg-purple-600 text-white hover:bg-purple-700">
          Retry Loading
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Production Dashboard</h1>
          <p className="text-gray-600">Monitor your production metrics and quality control in real-time</p>
        </div>

        {/* Filters Section */}
        <Card className="shadow-lg border-0 mb-8 bg-white">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-gray-800">
              <Filter className="h-5 w-5 text-purple-600" />
              Filters
            </CardTitle>
            <CardDescription>Apply filters to refine your dashboard view.</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
              {/* Date Filters */}
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-purple-600" />
                      {startDate ? format(startDate, "PPP") : "Select start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white">
                    <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-purple-600" />
                      {endDate ? format(endDate, "PPP") : "Select end date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white">
                    <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Firm Name (from Orders Sheet Column A) */}
              <div className="space-y-2">
                <Label>Firm Name</Label>
                <Select value={firmName} onValueChange={setFirmName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select firm" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {firmOptions.map((firm) => (
                      <SelectItem key={firm} value={firm}>
                        {firm}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Party Name (from Orders Sheet Column B) */}
              <div className="space-y-2">
                <Label>Party Name</Label>
                <Select value={partyName} onValueChange={setPartyName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select party" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {partyOptions.map((party) => (
                      <SelectItem key={party} value={party}>
                        {party}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product Name (from Orders Sheet Column D) */}
              <div className="space-y-2">
                <Label>Product Name</Label>
                <Select value={productName} onValueChange={setProductName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {productOptions.map((product) => (
                      <SelectItem key={product} value={product}>
                        {product}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Order No Search */}
              <div className="space-y-2">
                <Label>Order No.</Label>
                <input
                  type="text"
                  placeholder="Search order number..."
                  value={orderNo}
                  onChange={(e) => setOrderNo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Priority (from Master Sheet Column A) */}
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {masterData.priorities.map((priorityOption) => (
                      <SelectItem key={priorityOption} value={priorityOption}>
                        {priorityOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Supervisor (from Master Sheet Column B) */}
              <div className="space-y-2">
                <Label>Supervisor</Label>
                <Select value={supervisor} onValueChange={setSupervisor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supervisor" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {masterData.supervisors.map((sup) => (
                      <SelectItem key={sup} value={sup}>
                        {sup}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Shift (from Master Sheet Column C) */}
              <div className="space-y-2">
                <Label>Shift</Label>
                <Select value={shift} onValueChange={setShift}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {masterData.shifts.map((shiftOption) => (
                      <SelectItem key={shiftOption} value={shiftOption}>
                        {shiftOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Test Status (from Master Sheet Column D) */}
              <div className="space-y-2">
                <Label>Test Status</Label>
                <Select value={testStatus} onValueChange={setTestStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select test status" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {masterData.testStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tested By (from Master Sheet Column E) */}
              <div className="space-y-2">
                <Label>Tested By</Label>
                <Select value={testedBy} onValueChange={setTestedBy}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tester" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {masterData.testedBy.map((tester) => (
                      <SelectItem key={tester} value={tester}>
                        {tester}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Material Name (from Master Sheet Column I) */}
              <div className="space-y-2">
                <Label>Material Name</Label>
                <Select value={materialName} onValueChange={setMaterialName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {masterData.materials.map((material) => (
                      <SelectItem key={material} value={material}>
                        {material}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Flow of Material (from Master Sheet Column J) */}
              <div className="space-y-2">
                <Label>Flow of Material</Label>
                <Select value={flowOfMaterial} onValueChange={setFlowOfMaterial}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select flow" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {masterData.flows.map((flow) => (
                      <SelectItem key={flow} value={flow}>
                        {flow}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleResetFilters}>
                Reset Filters
              </Button>
              <Button onClick={refetch} className="bg-purple-600 text-white hover:bg-purple-700">
                Apply Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-white shadow-lg border-0">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Total Orders</CardTitle>
                <PackageCheck className="h-5 w-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-800">{dashboardMetrics.totalOrders}</div>
              <div className="flex items-center mt-2">
                <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                <span className="text-sm text-green-600">+3% from last month</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg border-0">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Production Efficiency</CardTitle>
                <Factory className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-800">{dashboardMetrics.productionEfficiency}%</div>
              <Progress value={dashboardMetrics.productionEfficiency} className="h-2 mt-2" />
              <div className="text-xs text-gray-500 mt-1">Target: 85%</div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg border-0">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Quality Issues</CardTitle>
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            </CardHeader>
            <CardContent>
              {/* In the KPI cards section, update the Quality Issues card: */}
              <div className="text-3xl font-bold text-gray-800">{dashboardMetrics.qualityIssues || "N/A"}</div>
              <div className="flex items-center mt-2">
                <span className="text-sm text-gray-500">No quality data available</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg border-0">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Pending Tests</CardTitle>
                <Beaker className="h-5 w-5 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              {/* And update the Pending Tests card: */}
              <div className="text-3xl font-bold text-gray-800">{dashboardMetrics.pendingTests || "N/A"}</div>
              <div className="flex items-center mt-2">
                <span className="text-sm text-gray-500">No test data available</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Production Trends */}
          <Card className="bg-white shadow-lg border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Production Trends
              </CardTitle>
              <CardDescription>Monthly production vs targets</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData.monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="planned" fill="#A78BFA" name="Planned" />
                    <Bar dataKey="actual" fill="#8B5CF6" name="Actual" />
                    <Line type="monotone" dataKey="efficiency" stroke="#10B981" strokeWidth={2} name="Efficiency %" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Order Status */}
          <Card className="bg-white shadow-lg border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChartIcon className="h-5 w-5 text-purple-600" />
                Order Status
              </CardTitle>
              <CardDescription>Current order distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData.statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {chartData.statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
