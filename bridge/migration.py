#!/usr/bin/env python3
"""
Bamboo Memory Migrator
======================
Tool for migrating memory, skills, configs, and sessions from ZCode,
Work Buddy, Codex, and other agents to Bamboo.

Usage:
    python migration.py --source zcode --target /path/to/bamboo
    python migration.py --dry-run --source workbuddy

Features:
    - Memory/note migration with path reference updates
    - Skill/config migration
    - Session migration
    - Model config transformation (OpenAI/Claude -> DeepSeek)
"""

import argparse
import json
import os
import re
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class MemoryMigrator:
    """Migrate memory and configuration between agent frameworks."""
    
    MIGRATION_SOURCES = {
        'zcode': {
            'memory': '.agents/notes',
            'skills': '.agents/skills',
            'projects': '.zcode/projects',
            'sessions': '.sessions',
            'config': '.zcode/config'
        },
        'workbuddy': {
            'memory': '.agents/notes',
            'skills': '.agents/skills',
            'projects': 'work-buddy/projects',
            'sessions': '.sessions',
            'config': 'work-buddy/config'
        },
        'codex': {
            'memory': '.codex/notes',
            'projects': 'codex/projects',
            'sessions': '.codex/sessions',
            'config': 'codex/config'
        }
    }
    
    MODEL_RENAMES = {
        # OpenAI models
        'gpt-4': 'deepseek-v4',
        'gpt-4-turbo': 'deepseek-v4',
        'gpt-4o': 'deepseek-v4',
        'gpt-3.5-turbo': 'deepseek-v4-flash',
        'gpt-3.5-turbo-16k': 'deepseek-v4-flash',
        
        # Anthropic models
        'claude-3-opus': 'deepseek-v4',
        'claude-3-sonnet': 'deepseek-v4',
        'claude-3-haiku': 'deepseek-v4-flash',
        
        # Moonshot models
        'moonshot-v1-8k': 'deepseek-moongroup-8k',
        'moonshot-v1-32k': 'deepseek-moongroup-32k',
        'moonshot-v1-128k': 'deepseek-moongroup-128k',
    }
    
    def __init__(self, target_dir: Path, dry_run: bool = False):
        self.target_dir = Path(target_dir)
        self.dry_run = dry_run
        self.migrated_count = 0
        self.skipped_count = 0
        
    def migrate(self, source: str) -> Dict:
        """Execute migration from specified source."""
        if source not in self.MIGRATION_SOURCES:
            raise ValueError(f"Unsupported source: {source}. "
                           f"Supported: {list(self.MIGRATION_SOURCES.keys())}")
        
        source_configs = self.MIGRATION_SOURCES[source]
        results = {
            'migrated': [],
            'skipped': [],
            'errors': []
        }
        
        # Execute migration phases
        if 'memory' in source_configs:
            phase_results = self._migrate_memory(source, source_configs['memory'])
            results['migrated'].extend(phase_results['migrated'])
            results['skipped'].extend(phase_results['skipped'])
            results['errors'].extend(phase_results['errors'])
        
        if 'skills' in source_configs:
            phase_results = self._migrate_skills(source, source_configs['skills'])
            results['migrated'].extend(phase_results['migrated'])
            results['skipped'].extend(phase_results['skipped'])
            results['errors'].extend(phase_results['errors'])
        
        if 'config' in source_configs:
            phase_results = self._migrate_configs(source, source_configs['config'])
            results['migrated'].extend(phase_results['migrated'])
            results['skipped'].extend(phase_results['skipped'])
            results['errors'].extend(phase_results['errors'])
        
        if 'sessions' in source_configs:
            phase_results = self._migrate_sessions(source, source_configs['sessions'])
            results['migrated'].extend(phase_results['migrated'])
            results['skipped'].extend(phase_results['skipped'])
            results['errors'].extend(phase_results['errors'])
        
        results['summary'] = {
            'migrated_count': self.migrated_count,
            'skipped_count': self.skipped_count
        }
        
        return results
    
    def _migrate_memory(self, source: str, source_path: str) -> Dict:
        """Migrate memory/notes directory."""
        results = {'migrated': [], 'skipped': [], 'errors': []}
        
        src_memory = Path(source_path)
        if not src_memory.exists():
            results['skipped'].append(f"{source_path} does not exist")
            return results
        
        dst_memory = self.target_dir / '.agents' / 'notes'
        
        print(f"Migrating memory from {src_memory} to {dst_memory}")
        
        for note_file in src_memory.rglob('*.md'):
            try:
                rel_path = note_file.relative_to(src_memory)
                dst_file = dst_memory / rel_path
                dst_file.parent.mkdir(parents=True, exist_ok=True)
                
                if not self.dry_run:
                    content = note_file.read_text(encoding='utf-8')
                    content = self._update_content(content)
                    dst_file.write_text(content, encoding='utf-8')
                
                results['migrated'].append(str(rel_path))
                self.migrated_count += 1
                
            except Exception as e:
                results['errors'].append(f"{note_file}: {str(e)}")
        
        return results
    
    def _migrate_skills(self, source: str, source_path: str) -> Dict:
        """Migrate skills directory."""
        results = {'migrated': [], 'skipped': [], 'errors': []}
        
        src_skills = Path(source_path)
        if not src_skills.exists():
            results['skipped'].append(f"{source_path} does not exist")
            return results
        
        dst_skills = self.target_dir / 'plugins'
        
        print(f"Migrating skills from {src_skills} to {dst_skills}")
        
        for skill_dir in src_skills.iterdir():
            if skill_dir.is_dir():
                dst_skill = dst_skills / skill_dir.name
                
                if not self.dry_run:
                    if dst_skill.exists():
                        shutil.rmtree(dst_skill)
                    shutil.copytree(skill_dir, dst_skill)
                
                results['migrated'].append(skill_dir.name)
                self.migrated_count += 1
        
        return results
    
    def _migrate_configs(self, source: str, source_path: str) -> Dict:
        """Migrate configuration files, updating model names."""
        results = {'migrated': [], 'skipped': [], 'errors': []}
        
        src_configs = Path(source_path)
        if not src_configs.exists():
            results['skipped'].append(f"{source_path} does not exist")
            return results
        
        dst_configs = self.target_dir / 'profiles'
        
        print(f"Migrating configs from {src_configs} to {dst_configs}")
        
        for config_file in src_configs.rglob('*.yml'):
            try:
                rel_path = config_file.relative_to(src_configs)
                dst_file = dst_configs / rel_path
                
                if not self.dry_run:
                    content = config_file.read_text(encoding='utf-8')
                    content = self._update_model_names(content)
                    dst_file.parent.mkdir(parents=True, exist_ok=True)
                    dst_file.write_text(content, encoding='utf-8')
                
                results['migrated'].append(str(rel_path))
                self.migrated_count += 1
                
            except Exception as e:
                results['errors'].append(f"{config_file}: {str(e)}")
        
        # Also migrate JSON configs
        for config_file in src_configs.rglob('*.json'):
            try:
                content_str = config_file.read_text(encoding='utf-8')
                try:
                    content = json.loads(content_str)
                except json.JSONDecodeError:
                    content = {'raw': content_str}
                
                content_str = json.dumps(content, ensure_ascii=False, indent=2)
                content_str = self._update_model_names(content_str)
                
                if not self.dry_run:
                    rel_path = config_file.relative_to(src_configs)
                    dst_file = dst_configs / rel_path.with_suffix('.yml')
                    dst_file.parent.mkdir(parents=True, exist_ok=True)
                    dst_file.write_text(content_str, encoding='utf-8')
                
                results['migrated'].append(f"{config_file.name} (converted)")
                self.migrated_count += 1
                
            except Exception as e:
                results['errors'].append(f"{config_file}: {str(e)}")
        
        return results
    
    def _migrate_sessions(self, source: str, source_path: str) -> Dict:
        """Migrate session files."""
        results = {'migrated': [], 'skipped': [], 'errors': []}
        
        src_sessions = Path(source_path)
        if not src_sessions.exists():
            results['skipped'].append(f"{source_path} does not exist")
            return results
        
        dst_sessions = self.target_dir / '.sessions'
        
        print(f"Migrating sessions from {src_sessions} to {dst_sessions}")
        
        for session_file in src_sessions.rglob('*.jsonl'):
            try:
                rel_path = session_file.relative_to(src_sessions)
                dst_file = dst_sessions / rel_path
                dst_file.parent.mkdir(parents=True, exist_ok=True)
                
                if not self.dry_run:
                    shutil.copy2(session_file, dst_file)
                
                results['migrated'].append(session_file.name)
                self.migrated_count += 1
                
            except Exception as e:
                results['errors'].append(f"{session_file}: {str(e)}")
        
        return results
    
    def _update_content(self, content: str) -> str:
        """Update content with bamboo-compatible references."""
        # Update model names
        content = self._update_model_names(content)
        
        # Update code references
        for old_model, new_model in self.MODEL_RENAMES.items():
            content = content.replace(f'"{old_model}"', f'"{new_model}"')
            content = content.replace(f"'{old_model}'", f"'{new_model}'")
            content = content.replace(f'`{old_model}`', f'`{new_model}`')
        
        # Update path references
        content = content.replace('~/.codex/', '~/.bamboo/')
        content = content.replace('~/.zcode/', '~/.bamboo/')
        content = content.replace('/.codex/', '/.bamboo/')
        content = content.replace('/.zcode/', '/.bamboo/')
        
        return content
    
    def _update_model_names(self, content: str) -> str:
        """Update model names to DeepSeek equivalents."""
        for old_model, new_model in self.MODEL_RENAMES.items():
            # Handle various quote styles
            content = re.sub(
                rf'"{re.escape(old_model)}"|\'{re.escape(old_model)}\'',
                f'"{new_model}"',
                content
            )
            content = re.sub(
                rf'model\s*[:=]\s*["\']?{re.escape(old_model)}["\']?',
                f'model: "{new_model}"',
                content
            )
        return content


def scan_for_migration(source: str) -> Dict:
    """Scan system to detect migratable content."""
    configs = MemoryMigrator.MIGRATION_SOURCES.get(source, {})
    
    results = {
        'source': source,
        'files': [],
        'total_size': 0
    }
    
    for key, path in configs.items():
        p = Path(path)
        if p.exists():
            files = list(p.rglob('*')) if key != 'config' else list(p.rglob('*.*'))
            size = sum(f.stat().st_size for f in files if f.is_file())
            
            results['files'].append({
                'type': key,
                'path': path,
                'count': len(files),
                'size': size
            })
            results['total_size'] += size
    
    return results


def main():
    parser = argparse.ArgumentParser(
        description="Bamboo Memory Migrator - Migrate from ZCode, Work Buddy, Codex"
    )
    parser.add_argument(
        '--source', '-s',
        choices=['zcode', 'workbuddy', 'codex'],
        required=True,
        help='Source agent framework to migrate from'
    )
    parser.add_argument(
        '--target', '-t',
        default='.',
        help='Target Bamboo directory (default: current directory)'
    )
    parser.add_argument(
        '--dry-run', '-n',
        action='store_true',
        help='Show what would be migrated without making changes'
    )
    parser.add_argument(
        '--scan-only',
        action='store_true',
        help='Only scan for migratable content, do not migrate'
    )
    
    args = parser.parse_args()
    
    target_dir = Path(args.target).resolve()
    print(f"Target directory: {target_dir}")
    
    if args.scan_only:
        print(f"\nScanning for {args.source} migration content...")
        results = scan_for_migration(args.source)
        print(f"\nFound {results['total_size']} bytes in {len(results['files'])} categories:")
        for f in results['files']:
            print(f"  {f['type']}: {f['count']} files, {f['count']} bytes")
        return
    
    migrator = MemoryMigrator(target_dir, dry_run=args.dry_run)
    
    print(f"\nMigrating from {args.source} to {target_dir}")
    print("=" * 60)
    
    if args.dry_run:
        print("[DRY RUN] No changes will be made\n")
    
    results = migrator.migrate(args.source)
    
    print("\n" + "=" * 60)
    print("Migration Results:")
    print(f"  Migrated: {results['summary']['migrated_count']} items")
    print(f"  Skipped:  {results['summary']['skipped_count']} items")
    
    if results['errors']:
        print("\nErrors:")
        for error in results['errors'][:10]:  # Show first 10 errors
            print(f"  - {error}")
        if len(results['errors']) > 10:
            print(f"  ... and {len(results['errors']) - 10} more")
    
    print("\nDone!")


if __name__ == "__main__":
    main()