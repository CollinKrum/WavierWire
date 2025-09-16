import { useState } from 'react';
import { useWaiverAnalysis } from '../hooks/useFantasy';

export default function WaiverAnalysis() {
  const [position, setPosition] = useState('RB');
  const { analysis, loading, error, runAnalysis } = useWaiverAnalysis(position);

  const handleAnalysis = () => {
    runAnalysis([]); // Could pass current roster player IDs here
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'HIGH': return 'text-red-600 bg-red-50';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-50';
      case 'LOW': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'HIGH': return '🔥';
      case 'MEDIUM': return '⚡';
      case 'LOW': return '💡';
      default: return '📊';
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-4">🎯 Waiver Wire Analysis</h2>
        
        <div className="flex gap-4 items-center mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Position</label>
            <select 
              value={position} 
              onChange={(e) => setPosition(e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md"
            >
              <option value="QB">Quarterback</option>
              <option value="RB">Running Back</option>
              <option value="WR">Wide Receiver</option>
              <option value="TE">Tight End</option>
              <option value="D/ST">Defense/ST</option>
              <option value="K">Kicker</option>
            </select>
          </div>
          
          <button 
            onClick={handleAnalysis}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium mt-6"
          >
            {loading ? '🔄 Analyzing...' : '🔍 Analyze Waivers'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded mb-4">
            ⚠️ {error}
          </div>
        )}
      </div>

      {analysis && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="text-2xl font-bold text-red-400">{analysis.summary.highPriority}</div>
              <div className="text-gray-300">High Priority</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="text-2xl font-bold text-yellow-400">{analysis.summary.mediumPriority}</div>
              <div className="text-gray-300">Medium Priority</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="text-2xl font-bold text-blue-400">{analysis.summary.totalAnalyzed}</div>
              <div className="text-gray-300">Total Analyzed</div>
            </div>
          </div>

          {/* Player Analysis */}
          <div className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
            <div className="px-6 py-4 border-b border-slate-700">
              <h3 className="text-xl font-semibold text-white">Available Players - {position}</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Team</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">% Owned</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Projection</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">FAAB Bid</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Reasoning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {analysis.analysis.map((player, index) => (
                    <tr key={player.id} className={index % 2 === 0 ? 'bg-slate-800' : 'bg-slate-750'}>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-white font-medium">{player.name}</div>
                        <div className="text-gray-400 text-sm">{player.position}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-gray-300">
                        {player.team}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-gray-300">
                        {player.ownershipPct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-white font-medium">{player.seasonProjection.toFixed(1)}</div>
                        <div className="text-gray-400 text-sm">{player.avgProjection.toFixed(1)}/wk</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(player.priority)}`}>
                          {getPriorityIcon(player.priority)} {player.priority}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-green-400 font-medium">
                        {player.faabBid}
                      </td>
                      <td className="px-4 py-4 text-gray-300 text-sm max-w-xs">
                        {player.reasoning}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-blue-900 border border-blue-700 rounded-lg p-4">
            <h4 className="text-blue-200 font-semibold mb-2">💡 Waiver Tips</h4>
            <ul className="text-blue-100 text-sm space-y-1">
              <li>• High priority players should be targeted even with higher FAAB bids</li>
              <li>• Consider your team's needs and bye weeks when prioritizing</li>
              <li>• Players with low ownership but high projections could be league winners</li>
              <li>• Monitor injury reports - backup RBs can become instant starters</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
