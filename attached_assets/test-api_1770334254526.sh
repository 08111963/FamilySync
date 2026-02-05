#!/bin/bash

# Family Sync - Automated API Testing Script
# Run: chmod +x test-api.sh && ./test-api.sh

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:5000"
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_PASSWORD="Test123!"
TEST_NAME="Test User"

# Counters
PASS=0
FAIL=0

# Function to print test result
test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
        ((PASS++))
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
        ((FAIL++))
    fi
}

# Function to make API call and check status
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local expected_status=$4
    local description=$5
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $TOKEN" \
            -d "$data")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
            -H "Authorization: Bearer $TOKEN")
    fi
    
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$status_code" -eq "$expected_status" ]; then
        test_result 0 "$description"
        echo "$body"
    else
        test_result 1 "$description (expected $expected_status, got $status_code)"
        echo "Response: $body"
    fi
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Family Sync - API Testing Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if server is running
echo -e "${YELLOW}Checking if server is running...${NC}"
if ! curl -s "$API_URL/api/auth/me" > /dev/null 2>&1; then
    echo -e "${RED}Error: Server not running at $API_URL${NC}"
    echo "Start the server with: npm run server:dev"
    exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"
echo ""

# Test 1: Signup
echo -e "${BLUE}=== 1. Testing Authentication ===${NC}"
echo -e "${YELLOW}Test 1: Signup${NC}"
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/auth/signup" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"name\":\"$TEST_NAME\"}")

status_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$status_code" -eq 201 ]; then
    test_result 0 "Signup successful"
    TOKEN=$(echo "$body" | grep -o '"accessToken":"[^"]*' | sed 's/"accessToken":"//')
    USER_ID=$(echo "$body" | grep -o '"id":"[^"]*' | sed 's/"id":"//')
    echo "  User ID: $USER_ID"
    echo "  Token: ${TOKEN:0:20}..."
else
    test_result 1 "Signup failed (status: $status_code)"
    echo "Response: $body"
    exit 1
fi
echo ""

# Test 2: Login
echo -e "${YELLOW}Test 2: Login${NC}"
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

status_code=$(echo "$response" | tail -n1)
if [ "$status_code" -eq 200 ]; then
    test_result 0 "Login successful"
else
    test_result 1 "Login failed (status: $status_code)"
fi
echo ""

# Test 3: Get current user
echo -e "${YELLOW}Test 3: Get current user (/api/auth/me)${NC}"
response=$(api_call "GET" "/api/auth/me" "" 200 "Get current user")
echo ""

# Test 4: Invalid token
echo -e "${YELLOW}Test 4: Invalid token rejection${NC}"
TOKEN_BACKUP=$TOKEN
TOKEN="invalid_token_12345"
response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/auth/me" \
    -H "Authorization: Bearer $TOKEN")
status_code=$(echo "$response" | tail -n1)
TOKEN=$TOKEN_BACKUP

if [ "$status_code" -eq 401 ]; then
    test_result 0 "Invalid token correctly rejected"
else
    test_result 1 "Invalid token not rejected (status: $status_code)"
fi
echo ""

# Test 5: Create family
echo -e "${BLUE}=== 2. Testing Family Management ===${NC}"
echo -e "${YELLOW}Test 5: Create family${NC}"
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/families" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Test Family","colorTheme":"#6366F1"}')

status_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$status_code" -eq 201 ]; then
    test_result 0 "Family created"
    FAMILY_ID=$(echo "$body" | grep -o '"id":"[^"]*' | head -n1 | sed 's/"id":"//')
    echo "  Family ID: $FAMILY_ID"
else
    test_result 1 "Family creation failed (status: $status_code)"
    echo "Response: $body"
fi
echo ""

# Test 6: List families
echo -e "${YELLOW}Test 6: List families${NC}"
response=$(api_call "GET" "/api/families" "" 200 "List families")
echo ""

# Test 7: Get family details
echo -e "${YELLOW}Test 7: Get family details${NC}"
response=$(api_call "GET" "/api/families/$FAMILY_ID" "" 200 "Get family details")
echo ""

# Test 8: Create calendar event
echo -e "${BLUE}=== 3. Testing Calendar ===${NC}"
echo -e "${YELLOW}Test 8: Create calendar event${NC}"
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/calendar/$FAMILY_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"title":"Test Event","description":"API Test","date":"2026-02-15","time":"14:00","color":"#6366F1","category":"other"}')

status_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$status_code" -eq 201 ]; then
    test_result 0 "Calendar event created"
    EVENT_ID=$(echo "$body" | grep -o '"id":"[^"]*' | head -n1 | sed 's/"id":"//')
    echo "  Event ID: $EVENT_ID"
else
    test_result 1 "Event creation failed (status: $status_code)"
fi
echo ""

# Test 9: List events
echo -e "${YELLOW}Test 9: List calendar events${NC}"
response=$(api_call "GET" "/api/calendar/$FAMILY_ID" "" 200 "List events")
echo ""

# Test 10: Update event
echo -e "${YELLOW}Test 10: Update calendar event${NC}"
response=$(api_call "PUT" "/api/calendar/$FAMILY_ID/$EVENT_ID" '{"time":"15:00"}' 200 "Update event")
echo ""

# Test 11: Delete event
echo -e "${YELLOW}Test 11: Delete calendar event${NC}"
response=$(api_call "DELETE" "/api/calendar/$FAMILY_ID/$EVENT_ID" "" 200 "Delete event")
echo ""

# Test 12: Create shopping list
echo -e "${BLUE}=== 4. Testing Shopping ===${NC}"
echo -e "${YELLOW}Test 12: Create shopping list${NC}"
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/shopping/$FAMILY_ID/lists" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Weekly Groceries","icon":"🛒"}')

status_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$status_code" -eq 201 ]; then
    test_result 0 "Shopping list created"
    LIST_ID=$(echo "$body" | grep -o '"id":"[^"]*' | head -n1 | sed 's/"id":"//')
    echo "  List ID: $LIST_ID"
else
    test_result 1 "Shopping list creation failed (status: $status_code)"
fi
echo ""

# Test 13: Add shopping item
echo -e "${YELLOW}Test 13: Add shopping item${NC}"
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/shopping/$FAMILY_ID/lists/$LIST_ID/items" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Milk","quantity":"2L","category":"Dairy"}')

status_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$status_code" -eq 201 ]; then
    test_result 0 "Shopping item added"
    ITEM_ID=$(echo "$body" | grep -o '"id":"[^"]*' | head -n1 | sed 's/"id":"//')
else
    test_result 1 "Shopping item creation failed (status: $status_code)"
fi
echo ""

# Test 14: Toggle shopping item
echo -e "${YELLOW}Test 14: Toggle shopping item${NC}"
response=$(api_call "PUT" "/api/shopping/$FAMILY_ID/lists/$LIST_ID/items/$ITEM_ID" '{"isChecked":true}' 200 "Toggle item")
echo ""

# Test 15: Create chore
echo -e "${BLUE}=== 5. Testing Chores ===${NC}"
echo -e "${YELLOW}Test 15: Create chore${NC}"
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/chores/$FAMILY_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"title":"Clean Kitchen","description":"Wash dishes","difficulty":"easy","points":10,"estimatedMinutes":30}')

status_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$status_code" -eq 201 ]; then
    test_result 0 "Chore created"
    CHORE_ID=$(echo "$body" | grep -o '"id":"[^"]*' | head -n1 | sed 's/"id":"//')
else
    test_result 1 "Chore creation failed (status: $status_code)"
fi
echo ""

# Test 16: List chores
echo -e "${YELLOW}Test 16: List chores${NC}"
response=$(api_call "GET" "/api/chores/$FAMILY_ID" "" 200 "List chores")
echo ""

# Test 17: Stripe products
echo -e "${BLUE}=== 6. Testing Payments ===${NC}"
echo -e "${YELLOW}Test 17: Get Stripe publishable key${NC}"
response=$(api_call "GET" "/api/payments/publishable-key" "" 200 "Get Stripe key")
echo ""

echo -e "${YELLOW}Test 18: List Stripe products${NC}"
response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/payments/products")
status_code=$(echo "$response" | tail -n1)
if [ "$status_code" -eq 200 ]; then
    test_result 0 "Stripe products listed"
else
    test_result 1 "Stripe products failed (status: $status_code)"
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Total Tests: $((PASS + FAIL))"
echo -e "${GREEN}Passed: $PASS${NC}"
echo -e "${RED}Failed: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! 🎉${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
