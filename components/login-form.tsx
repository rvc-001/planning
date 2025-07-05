// app/login/page.tsx
"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, User as UserIcon, Lock as LockIcon, Eye, EyeOff } from "lucide-react" // Import Eye and EyeOff icons
import Link from "next/link" // Import Link component

export default function LoginForm() {
  const { login, isSubmitting } = useAuth()
  const [username, setUsername] = useState<string>("")
  const [password, setPassword] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [showPassword, setShowPassword] = useState<boolean>(false) // State for password visibility

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    if (!username || !password) {
      setError("Please enter both username and password.")
      return
    }

    const result = await login(username, password)

    if (!result.success) {
      setError(result.error || "Login failed. Please check your credentials.")
    }
    // On success, the AuthProvider handles the redirect automatically
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#E0E7FF] via-[#EEF2FF] to-[#F5F7FF]"> {/* Light purple gradient background */}
      <Card className="w-full max-w-lg mx-auto border-none shadow-xl rounded-xl overflow-hidden"> {/* Increased max-w-lg (wider), increased shadow */}
        <div className="p-6 text-center bg-gradient-to-r from-[#CAD6FF] to-[#DCE6FF] text-purple-800 font-bold text-2xl rounded-t-xl"> {/* Gradient for Market Mode header, bold and larger font */}
          Production Planning-App
        </div>
        <form onSubmit={handleSubmit}>
          <CardHeader className="pt-8 pb-4"> {/* Increased top padding */}
            {/* Removed CardTitle and CardDescription as requested */}
          </CardHeader>
          <CardContent className="space-y-6 px-8 pt-4 pb-0"> {/* Increased horizontal and vertical spacing */}
            {error && (
              <Alert variant="destructive" className="bg-red-50 text-red-700 border-red-200">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-3"> {/* Increased spacing */}
              <Label htmlFor="username" className="text-gray-700 flex items-center gap-2 text-base"> {/* Increased font size to text-base */}
                <UserIcon className="h-6 w-6 text-purple-600" /> Username {/* Enlarge icon to h-6 w-6 */}
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                required
                value={username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                disabled={isSubmitting}
                className="border-purple-300 focus:ring-purple-500 focus:border-purple-500 text-gray-800 p-3 text-lg" // Increased padding and font size to text-lg
              />
            </div>
            <div className="space-y-3"> {/* Increased spacing */}
              <Label htmlFor="password" className="text-gray-700 flex items-center gap-2 text-base"> {/* Increased font size to text-base */}
                <LockIcon className="h-6 w-6 text-purple-600" /> Password {/* Enlarge icon to h-6 w-6 */}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"} // Toggle type based on state
                  placeholder="Enter your password"
                  required
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  className="border-purple-300 focus:ring-purple-500 focus:border-purple-500 text-gray-800 pr-10 p-3 text-lg" // Increased padding and font size to text-lg, added pr-10 for button
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-600 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="pt-8 px-8 pb-8"> {/* Increased padding */}
            <Button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 p-3.5 text-lg" disabled={isSubmitting}> {/* Gradient button matching image, increased padding and font size */}
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Login
            </Button>
          </CardFooter>
        </form>
      </Card>
      {/* Footer for the entire page */}
      <div className="absolute bottom-0 w-full p-4 text-center text-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600"> {/* Gradient footer matching button */}
        Powered by{" "}
        <Link href="https://www.botivate.in/" target="_blank" rel="noopener noreferrer" className="text-white hover:underline"> {/* Added Link component with href */}
          Botivate
        </Link>
      </div>
    </div>
  )
}