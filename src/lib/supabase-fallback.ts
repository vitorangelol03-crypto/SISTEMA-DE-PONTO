export class SupabaseFallback {
  private baseUrl: string;

  constructor() {
    this.baseUrl = window.location.origin;
  }

  async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}/api/${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  auth = {
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      const userId = email.split('@')[0];
      return this.request('auth/login', {
        method: 'POST',
        body: JSON.stringify({ userId, password }),
      });
    },

    signUp: async (options: any) => {
      return this.request('auth/signup', {
        method: 'POST',
        body: JSON.stringify(options),
      });
    },

    signOut: async () => {
      return this.request('auth/logout', {
        method: 'POST',
      });
    },

    getSession: async () => {
      const sessionStr = localStorage.getItem('supabase-session');
      if (!sessionStr) {
        return { data: { session: null }, error: null };
      }

      try {
        const session = JSON.parse(sessionStr);
        return { data: { session }, error: null };
      } catch {
        return { data: { session: null }, error: null };
      }
    },
  };

  from(table: string) {
    return new TableQuery(table, this.baseUrl);
  }
}

class TableQuery {
  private table: string;
  private baseUrl: string;
  private filters: Record<string, any> = {};
  private selectFields = '*';

  constructor(table: string, baseUrl: string) {
    this.table = table;
    this.baseUrl = baseUrl;
  }

  select(fields: string = '*') {
    this.selectFields = fields;
    return this;
  }

  eq(column: string, value: any) {
    this.filters[column] = value;
    return this;
  }

  async maybeSingle() {
    const params = new URLSearchParams({
      ...this.filters,
      select: this.selectFields,
      single: 'true',
    });

    const response = await fetch(`${this.baseUrl}/api/${this.table}?${params}`);

    if (!response.ok) {
      return { data: null, error: { message: 'Query failed' } };
    }

    const data = await response.json();
    return { data, error: null };
  }

  async single() {
    const result = await this.maybeSingle();
    if (!result.data) {
      return { data: null, error: { message: 'No rows found' } };
    }
    return result;
  }
}

export const supabaseFallback = new SupabaseFallback();
