import React, { useState } from 'react';

type DocumentType = 'docx' | 'pdf' | 'pptx';
type CoverRecipe = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';

export const DocumentSkillsPanel: React.FC = () => {
  const [documentType, setDocumentType] = useState<DocumentType>('docx');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverRecipe, setCoverRecipe] = useState<CoverRecipe>('R1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateDocument = async () => {
    if (!title.trim() || !content.trim()) {
      setError('标题和内容不能为空');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/document/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: documentType,
          title,
          content,
          coverRecipe,
          metadata: { author: 'Bamboo', version: '1.0.0' }
        })
      });
      
      const result = await res.json();

      if (result.success) {
        const blob = new Blob([result.content], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || title + '.docx';
        a.click();
      } else {
        setError(result.error || '生成失败');
      }
    } catch (err) {
      setError('未知错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="document-skills-panel">
      <h3>文档生成器</h3>
      
      <select
        value={documentType}
        onChange={(e) => setDocumentType(e.target.value as DocumentType)}
      >
        <option value="docx">DOCX 文档</option>
        <option value="pdf">PDF 文档</option>
        <option value="pptx">PPTX 演示</option>
      </select>

      <input
        type="text"
        placeholder="文档标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        placeholder="文档内容（支持 Markdown 格式）"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={10}
      />

      <select
        value={coverRecipe}
        onChange={(e) => setCoverRecipe(e.target.value as CoverRecipe)}
      >
        <option value="R1">R1 - 报告封面</option>
        <option value="R2">R2 - 学术论文</option>
        <option value="R3">R3 - 合同</option>
        <option value="R4">R4 - 简历</option>
        <option value="R5">R5 - 说明书</option>
        <option value="R6">R6 - 方案</option>
        <option value="R7">R7 - 演示文稿</option>
      </select>

      {error && <div className="error-message" style={{color: 'red'}}>{error}</div>}

      <button
        onClick={generateDocument}
        disabled={loading || !title.trim() || !content.trim()}
      >
        {loading ? '生成中...' : '生成文档'}
      </button>
    </div>
  );
};