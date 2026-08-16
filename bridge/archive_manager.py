#!/usr/bin/env python3
"""
DSH Archive Manager Plugin
==========================
Python wrapper for the dsh-archive-manager JavaScript plugin.

This provides Python API endpoints for:
- Listing archived sessions
- Unarchiving sessions
- Deleting sessions
- Session status management

Usage:
    Import and use the ArchiveManager class directly
    OR call bridge/main.py which exposes /api/archive/* endpoints
"""

import json
import os
import subprocess
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional, TypedDict, Literal


class SessionInfo(TypedDict):
    id: str
    title: str
    createdAt: int
    updatedAt: int
    status: Literal['running', 'completed', 'waiting', 'archived']
    workspace?: str


class ArchiveResult(TypedDict):
    ok: bool
    code?: str
    detail?: Dict


class ArchiveManager:
    """Manages archived sessions for dsh compatibility."""
    
    def __init__(self, sessions_dir: Optional[Path] = None):
        """Initialize archive manager."""
        self.sessions_dir = sessions_dir or Path('.') / '.sessions'
        self._agent_disposers: Dict[str, callable] = {}
        
    def get_session_root(self) -> Path:
        """Get the session storage root directory."""
        return self.sessions_dir
    
    def list_all_sessions(self) -> List[SessionInfo]:
        """List all sessions, including archived ones."""
        sessions = []
        
        if not self.sessions_dir.exists():
            return sessions
        
        # Read from session storage
        for session_file in self.sessions_dir.glob('*.jsonl'):
            try:
                session_info = self._read_session_header(session_file)
                if session_info:
                    sessions.append(session_info)
            except Exception:
                continue
        
        return sessions
    
    def list_archived_sessions(self) -> List[SessionInfo]:
        """List only archived sessions."""
        all_sessions = self.list_all_sessions()
        # Archived sessions have an 'archived' flag in their metadata
        return [s for s in all_sessions if s.get('status') == 'archived']
    
    def _read_session_header(self, session_file: Path) -> Optional[SessionInfo]:
        """Read session header from JSONL file."""
        try:
            with open(session_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                        if msg.get('type') == 'session':
                            return {
                                'id': msg.get('id', ''),
                                'title': msg.get('title', session_file.stem),
                                'createdAt': msg.get('createdAt', 0),
                                'updatedAt': int(time.time() * 1000),
                                'status': 'archived' if session_file.suffix == '.archived' else 'completed'
                            }
                    except json.JSONDecodeError:
                        continue
        except Exception:
            pass
        return None
    
    def unarchive_session(self, session_id: str) -> ArchiveResult:
        """Unarchive a session, putting it back in the active workspace."""
        session_root = self.get_session_root()
        
        # Find the archived session file
        archived_path = session_root / f"{session_id}.archived.jsonl"
        active_path = session_root / f"{session_id}.jsonl"
        
        if not archived_path.exists() and active_path.exists():
            # Already active
            return {'ok': True, 'code': 'already-active'}
        
        if archived_path.exists():
            try:
                # Move from archived to active
                if active_path.exists():
                    active_path.unlink()
                archived_path.rename(active_path)
                return {'ok': True}
            except Exception as e:
                return {'ok': False, 'code': 'unarchive-failed', 'detail': {'error': str(e)}}
        
        return {'ok': False, 'code': 'not-found'}
    
    def delete_session(self, session_id: str) -> ArchiveResult:
        """
        Delete a session completely.
        
        This performs full teardown:
        1. Stops any running agent
        2. Removes from registry
        3. Deletes session files
        """
        session_root = self.get_session_root()
        
        # 1. Stop the agent if running
        if session_id in self._agent_disposers:
            try:
                disposer = self._agent_disposers.pop(session_id)
                disposer()
            except Exception:
                pass
        
        # 2. Find all session files
        patterns = [
            f"{session_id}.jsonl",
            f"{session_id}.archived.jsonl",
            f"{session_id}.session.jsonl"
        ]
        
        deleted_files = []
        for pattern in patterns:
            file_path = session_root / pattern
            if file_path.exists():
                try:
                    file_path.unlink()
                    deleted_files.append(str(file_path))
                except Exception as e:
                    return {
                        'ok': False,
                        'code': 'delete-failed',
                        'detail': {'error': str(e), 'deleted': deleted_files}
                    }
        
        # 3. Clean up orphaned session directory
        session_dir = session_root / session_id
        if session_dir.exists() and session_dir.is_dir():
            try:
                import shutil
                shutil.rmtree(session_dir)
                deleted_files.append(str(session_dir))
            except Exception:
                pass
        
        if deleted_files:
            return {
                'ok': True,
                'detail': {'deleted': deleted_files}
            }
        
        return {'ok': False, 'code': 'not-found'}
    
    def capture_agent_disposer(self, agent_id: str, disposer: callable):
        """
        Capture the disposer function for an agent.
        
        This allows proper cleanup when sessions are deleted.
        Called during agent creation/resume.
        """
        self._agent_disposers[agent_id] = disposer
    
    def list_sessions_by_workspace(self) -> Dict[str, List[SessionInfo]]:
        """Group sessions by workspace."""
        all_sessions = self.list_all_sessions()
        workspaces: Dict[str, List[SessionInfo]] = {'ungrouped': []}
        
        for session in all_sessions:
            workspace = session.get('workspace', 'ungrouped')
            if workspace not in workspaces:
                workspaces[workspace] = []
            workspaces[workspace].append(session)
        
        return workspaces
    
    def get_session_status(self, session_id: str) -> Dict:
        """Get detailed status of a session."""
        sessions = self.list_all_sessions()
        session = next((s for s in sessions if s['id'] == session_id), None)
        
        if not session:
            return {'ok': False, 'code': 'not-found'}
        
        # Check if agent is running
        is_running = session_id in self._agent_disposers
        
        return {
            'ok': True,
            'session': session,
            'isRunning': is_running,
            'agentId': session_id if is_running else None
        }


# Global instance (singleton pattern)
_archive_manager: Optional[ArchiveManager] = None


def get_archive_manager() -> ArchiveManager:
    """Get or create the global archive manager instance."""
    global _archive_manager
    if _archive_manager is None:
        _archive_manager = ArchiveManager()
    return _archive_manager


# HTTP API endpoints (for FastAPI)

async def api_archive_list(request) -> Dict:
    """API: List all sessions (including archived)."""
    manager = get_archive_manager()
    return {'sessions': manager.list_all_sessions()}


async def api_archive_get(request, session_id: str) -> Dict:
    """API: Get session info."""
    manager = get_archive_manager()
    status = manager.get_session_status(session_id)
    if status['ok']:
        return status
    return status


async def api_archive_unarchive(request) -> Dict:
    """API: Unarchive a session."""
    try:
        body = await request.json()
    except:
        body = {}
    
    session_id = body.get('sessionId')
    if not session_id:
        return {'ok': False, 'code': 'missing-session-id'}
    
    manager = get_archive_manager()
    return manager.unarchive_session(session_id)


async def api_archive_delete(request) -> Dict:
    """API: Delete a session."""
    try:
        body = await request.json()
    except:
        body = {}
    
    session_id = body.get('sessionId')
    if not session_id:
        return {'ok': False, 'code': 'missing-session-id'}
    
    manager = get_archive_manager()
    return manager.delete_session(session_id)


async def api_session_status(request, session_id: str) -> Dict:
    """API: Get session status."""
    manager = get_archive_manager()
    return manager.get_session_status(session_id)


# Integration with dsh bridge

def integrate_with_bridge(bridge_instance):
    """
    Integrate archive manager with bridge instance.
    
    This should be called when creating the Bridge class.
    """
    manager = get_archive_manager()
    bridge_instance.archive_manager = manager
    
    # Set up hook for agent disposer capture
    async def run_with_archive_support(prompt: str, preset: str = "standard"):
        # This would be called by the bridge's run_session
        pass
    
    return manager


if __name__ == "__main__":
    # Test the archive manager
    manager = ArchiveManager()
    print("Session root:", manager.get_session_root())
    print("Sessions:", manager.list_all_sessions())