'use client';

import { useEffect, useState } from'react';
import { useRouter } from 'next/router';
import { Line } from'react-chartjs-2';
import axios from 'axios';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface ApiUsageData {
  id: string;
  endpoint: string;
  method: string;
  avgLatency: number;
  errorRate: number;
  callCount: number;
}

interface RateLimitData {
  apiKey: string;
  remainingRequests: number;
  resetTime: string;
}

interface ErrorLogData {
  timestamp: string;
  message: string;
}

const ApiUsagePage = () => {
  const [apiUsageData, setApiUsageData] = useState<ApiUsageData[]>([]);
  const [rateLimitData, setRateLimitData] = useState<RateLimitData | null>(null);
  const [errorLogData, setErrorLogData] = useState<ErrorLogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [apiUsageResponse, rateLimitResponse, errorLogResponse] = await Promise.all([
          axios.get('/api/api-usage'),
          axios.get('/api/rate-limit'),
          axios.get('/api/error-logs')
        ]);
        setApiUsageData(apiUsageResponse.data);
        setRateLimitData(rateLimitResponse.data);
        setErrorLogData(errorLogResponse.data);
      } catch (err) {
        setError('Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    setError(null);
    useEffect(() => {
      const fetchData = async () => {
        try {
          const [apiUsageResponse, rateLimitResponse, errorLogResponse] = await Promise.all([
            axios.get('/api/api-usage'),
            axios.get('/api/rate-limit'),
            axios.get('/api/error-logs')
          ]);
          setApiUsageData(apiUsageResponse.data);
          setRateLimitData(rateLimitResponse.data);
          setErrorLogData(errorLogResponse.data);
        } catch (err) {
          setError('Failed to refresh data');
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, []);
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;

  const chartData = {
    labels: ['12am', '1am', '2am', '3am', '4am', '5am', '6am', '7am', '8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm'],
    datasets: [
      {
        label: 'API Calls',
        data: [120, 150, 130, 170, 160, 140, 180, 190, 200, 220, 210, 190, 180, 170, 160, 150, 140, 130, 120, 110, 100, 90, 80, 70],
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        borderColor: 'rgba(139, 92, 246, 1)',
        borderWidth: 1,
      },
    ],
  };

  return (
    <div className="api-usage-container font-inter text-text bg-bg p-5">
      <div className="api-usage-header flex justify-between items-center mb-5">
        <h1 className="text-24 text-primary">API Usage Monitoring</h1>
        <button className="api-usage-button inline-block px-5 py-2.5 mt-2.5 bg-primary text-bg border-none rounded-md cursor-pointer transition-colors duration-300 hover:bg-primary-light" onClick={handleRefresh}>
          Refresh Data
        </button>
      </div>

      <div className="api-usage-chart bg-card-bg p-5 rounded-2xl shadow-md">
        <h2 className="text-lg text-primary mb-2.5">API Call Volume (Last 24 Hours)</h2>
        <Line data={chartData} />
      </div>

      <table className="api-usage-table w-full border-collapse mt-5">
        <thead>
          <tr>
            <th className="p-3 text-left border-b border-border text-primary">Endpoint Path</th>
            <th className="p-3 text-left border-b border-border text-primary">Method</th>
            <th className="p-3 text-left border-b border-border text-primary">Avg Latency (ms)</th>
            <th className="p-3 text-left border-b border-border text-primary">Error Rate (%)</th>
            <th className="p-3 text-left border-b border-border text-primary">Call Count</th>
          </tr>
        </thead>
        <tbody>
          {apiUsageData.map((data) => (
            <tr key={data.id} className="hover:bg-primary-light">
              <td className="p-3 text-left border-b border-border">{data.endpoint}</td>
              <td className="p-3 text-left border-b border-border">{data.method}</td>
              <td className="p-3 text-left border-b border-border">{data.avgLatency}</td>
              <td className="p-3 text-left border-b border-border">{data.errorRate}</td>
              <td className="p-3 text-left border-b border-border">{data.callCount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rateLimitData && (
        <div className="api-usage-rate-limit mt-5 bg-card-bg p-5 rounded-2xl shadow-md">
          <h2 className="text-lg text-primary mb-2.5">Rate Limit Status</h2>
          <p>API Key: {rateLimitData.apiKey}</p>
          <p>Remaining Requests: {rateLimitData.remainingRequests}</p>
          <p>Reset Time: {rateLimitData.resetTime}</p>
        </div>
      )}

      <div className="api-usage-error-log mt-5 bg-card-bg p-5 rounded-2xl shadow-md">
        <h2 className="text-lg text-primary mb-2.5">Error Log Feed</h2>
        <ul>
          {errorLogData.map((log) => (
            <li key={log.timestamp} className="py-2 border-b border-border last:border-none">
              <strong>{log.timestamp}</strong> - {log.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ApiUsagePage;