# Error Handling Patterns in Autotask Integration

This document describes the error handling patterns used in the Autotask integration for n8n.

## Overview

The integration implements a comprehensive error handling system that includes:
- Centralized error handling through the `handleErrors` utility
- Consistent error message templates
- Operation-specific error context
- Rate limiting and retry logic
- Validation error handling

## Error Handling Structure

### Core Error Handler

```typescript
async function handleErrors<T>(
  context: IExecuteFunctions,
  operation: () => Promise<T>,
  errorContext: {
    operation: string;
    entityType: string;
  }
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Add operation context to error
    error.context = {
      ...error.context,
      ...errorContext
    };
    
    // Process and enhance error message
    error.message = formatErrorMessage(error, errorContext);
    
    throw error;
  }
}
```

## Error Message Templates

```typescript
const ERROR_TEMPLATES = {
  validation: '[{type}] {entity}: {details}',
  notFound: '[{type}] {entity} not found: {details}',
  unauthorized: '[{type}] Unauthorized access to {entity}: {details}',
  rateLimit: '[{type}] Rate limit exceeded for {entity}: {details}',
  network: '[{type}] Network error accessing {entity}: {details}',
  unknown: '[{type}] Unknown error with {entity}: {details}'
};
```

## Operation-Specific Error Handling

### CRUD Operations

```typescript
// Create operation error handling
try {
  const response = await handleErrors(
    context,
    async () => {
      // Create operation code
    },
    {
      operation: 'create',
      entityType: 'Company'
    }
  );
} catch (error) {
  // Handle specific create operation errors
}

// Update operation error handling
try {
  const response = await handleErrors(
    context,
    async () => {
      // Update operation code
    },
    {
      operation: 'update',
      entityType: 'Company'
    }
  );
} catch (error) {
  // Handle specific update operation errors
}
```

### Attachment Operations

```typescript
// Upload attachment error handling
try {
  const response = await handleErrors(
    context,
    async () => {
      // Validate file size
      if (data.size > MAX_ATTACHMENT_SIZE) {
        throw new Error(`File size exceeds maximum allowed size of ${MAX_ATTACHMENT_SIZE} bytes`);
      }
      
      // Upload operation code
    },
    {
      operation: 'upload',
      entityType: 'TaskAttachment'
    }
  );
} catch (error) {
  // Handle specific upload errors
}
```

### Parent/Child Operations

```typescript
// Child resource error handling
try {
  const response = await handleErrors(
    context,
    async () => {
      // Validate parent exists
      const parentId = await this.getParameter(`${this.parentType}ID`, itemIndex);
      if (!parentId) {
        throw new Error(`Parent ${this.parentType} ID is required`);
      }
      
      // Operation code
    },
    {
      operation: 'create',
      entityType: 'Task'
    }
  );
} catch (error) {
  // Handle specific child resource errors
}
```

## Validation Error Handling

### Parameter Validation

```typescript
// Parameter validation error handling
try {
  const value = await handleErrors(
    context,
    async () => {
      return await this.getParameter('parameterName', itemIndex);
    },
    {
      operation: 'validation',
      entityType: this.entityType
    }
  );
} catch (error) {
  // Handle parameter validation errors
}
```

### Field Validation

```typescript
// Field validation error handling
try {
  const processedValue = await handleErrors(
    context,
    async () => {
      return await this.processFieldValues(value);
    },
    {
      operation: 'fieldValidation',
      entityType: this.entityType
    }
  );
} catch (error) {
  // Handle field validation errors
}
```

## Rate Limiting

### Rate Limit Detection

```typescript
function isRateLimitError(error: any): boolean {
  return (
    error.response?.status === 429 ||
    error.message?.includes('rate limit exceeded')
  );
}
```

### Retry Logic

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
  }
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (!isRateLimitError(error)) {
        throw error;
      }
      
      const delay = Math.min(
        options.baseDelay * Math.pow(2, attempt - 1),
        options.maxDelay
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
```

## Error Context Management

### Adding Context

```typescript
function enhanceErrorContext(
  error: Error,
  context: {
    operation: string;
    entityType: string;
    details?: Record<string, unknown>;
  }
): Error {
  error.context = {
    ...error.context,
    ...context,
    timestamp: new Date().toISOString()
  };
  
  return error;
}
```

### Error Logging

```typescript
function logError(
  error: Error,
  context: IExecuteFunctions
): void {
  console.error('Operation failed:', {
    message: error.message,
    context: error.context,
    stack: error.stack
  });
}
```

## Best Practices

1. **Always Use handleErrors**
   - Wrap all operations with handleErrors
   - Provide meaningful operation and entity type context
   - Include relevant details in error messages

2. **Validation First**
   - Validate parameters before making API calls
   - Check parent/child relationships
   - Verify entity capabilities

3. **Specific Error Messages**
   - Use error templates consistently
   - Include attempted values in validation errors
   - Provide clear resolution steps

4. **Rate Limit Handling**
   - Implement exponential backoff
   - Set appropriate retry limits
   - Log rate limit occurrences

5. **Error Context**
   - Include operation context
   - Add timestamp information
   - Preserve error chain

6. **Debugging Support**
   - Log appropriate debug information
   - Include request/response details
   - Maintain error stack traces 
