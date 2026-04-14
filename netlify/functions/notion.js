const NOTION_API_KEY = process.env.NOTION_API_KEY;
const PROBLEM_DB_ID = '9a12c054-b669-46ae-ae07-32da570a924e';
const NOTE_DB_ID = '2b61f22e-e20b-4a9d-8528-605422959311';
const STUDENTS_PAGE_ID = '2ee43f2a-920f-802f-b610-eacad40909e5';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

async function notionRequest(endpoint, method = 'GET', body = null) {
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { action, data } = JSON.parse(event.body || '{}');

  try {
    // 문제 저장
    if (action === 'saveProblem') {
      const { subject, book, unit1, unit2, unit3, num, diff, answer, solution, size } = data;
      const diffLabel = ['', '하', '중하', '중', '중상', '상'][diff] || '중';
      const title = `${subject} ${num}번 (${book})`;

      const res = await notionRequest('/pages', 'POST', {
        parent: { database_id: PROBLEM_DB_ID },
        properties: {
          '문제 제목': { title: [{ text: { content: title } }] },
          '과목': { rich_text: [{ text: { content: subject || '' } }] },
          '교재명': { rich_text: [{ text: { content: book || '' } }] },
          '대단원': { rich_text: [{ text: { content: unit1 || '' } }] },
          '중단원': { rich_text: [{ text: { content: unit2 || '' } }] },
          '소단원': { rich_text: [{ text: { content: unit3 || '' } }] },
          '문제번호': { number: num || 0 },
          '난이도': { select: { name: diffLabel } },
          '정답': { rich_text: [{ text: { content: answer || '' } }] },
          '해설': { rich_text: [{ text: { content: solution || '' } }] },
        },
        ...(size ? { children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: `그리드 크기: ${size}` } }] } }] } : {}),
      });

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: res.id, url: res.url }) };
    }

    // 문제 목록 불러오기
    if (action === 'getProblems') {
      const res = await notionRequest(`/databases/${PROBLEM_DB_ID}/query`, 'POST', {
        sorts: [{ property: '문제번호', direction: 'ascending' }],
        page_size: 100,
      });

      const problems = res.results.map(p => ({
        id: p.id,
        url: p.url,
        subject: p.properties['과목']?.rich_text?.[0]?.text?.content || '',
        book: p.properties['교재명']?.rich_text?.[0]?.text?.content || '',
        unit1: p.properties['대단원']?.rich_text?.[0]?.text?.content || '',
        unit2: p.properties['중단원']?.rich_text?.[0]?.text?.content || '',
        unit3: p.properties['소단원']?.rich_text?.[0]?.text?.content || '',
        num: p.properties['문제번호']?.number || 0,
        diff: ['하','중하','중','중상','상'].indexOf(p.properties['난이도']?.select?.name) + 1 || 3,
        answer: p.properties['정답']?.rich_text?.[0]?.text?.content || '',
        solution: p.properties['해설']?.rich_text?.[0]?.text?.content || '',
        date: p.created_time?.split('T')[0] || '',
        qImg: null, aImg: null, sImgs: [], size: '1x1',
      }));

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, problems }) };
    }

    // 문제 삭제 (아카이브)
    if (action === 'deleteProblem') {
      await notionRequest(`/pages/${data.id}`, 'PATCH', { archived: true });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // 오답 노트 저장
    if (action === 'saveNote') {
      const { title, footer, student, subject, problemCount } = data;
      const res = await notionRequest('/pages', 'POST', {
        parent: { database_id: NOTE_DB_ID },
        properties: {
          '노트 제목': { title: [{ text: { content: title || '제목 없음' } }] },
          '학생': { rich_text: [{ text: { content: student || '' } }] },
          '과목': { rich_text: [{ text: { content: subject || '' } }] },
          '격려의 글': { rich_text: [{ text: { content: footer || '' } }] },
          '문제 수': { number: problemCount || 0 },
          '상태': { select: { name: '완성' } },
        },
      });

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: res.id, url: res.url }) };
    }

    // 저장된 오답 노트 목록
    if (action === 'getNotes') {
      const res = await notionRequest(`/databases/${NOTE_DB_ID}/query`, 'POST', {
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        page_size: 50,
      });

      const notes = res.results.map(n => ({
        id: n.id,
        url: n.url,
        title: n.properties['노트 제목']?.title?.[0]?.text?.content || '제목 없음',
        student: n.properties['학생']?.rich_text?.[0]?.text?.content || '',
        subject: n.properties['과목']?.rich_text?.[0]?.text?.content || '',
        footer: n.properties['격려의 글']?.rich_text?.[0]?.text?.content || '',
        count: n.properties['문제 수']?.number || 0,
        status: n.properties['상태']?.select?.name || '',
        date: n.created_time?.split('T')[0] || '',
      }));

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, notes }) };
    }

    // 학생 목록 불러오기
    if (action === 'getStudents') {
      const res = await notionRequest(`/blocks/${STUDENTS_PAGE_ID}/children`, 'GET');
      const studentPages = res.results
        .filter(b => b.type === 'child_page')
        .map(b => ({ id: b.id, name: b.child_page?.title || '' }));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, students: studentPages }) };
    }

    // 학생 노션 페이지에 오답 노트 전송
    if (action === 'sendToStudent') {
      const { studentId, studentName, noteTitle, footer, problems } = data;
      const content = `# ${noteTitle}\n\n${problems.map((p, i) =>
        `## ${i+1}. ${p.subject} ${p.num}번 (${p.book})\n- 단원: ${p.unit2 || p.unit1}\n- 정답: ${p.answer || '—'}\n- 해설: ${p.solution || '—'}\n`
      ).join('\n')}\n\n---\n*${footer || ''}*`;

      await notionRequest('/pages', 'POST', {
        parent: { page_id: studentId },
        properties: { title: [{ text: { content: `📋 ${noteTitle}` } }] },
        children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: content } }] } }],
      });

      // 노트 상태 전송됨으로 업데이트
      if (data.noteId) {
        await notionRequest(`/pages/${data.noteId}`, 'PATCH', {
          properties: { '상태': { select: { name: '전송됨' } } },
        });
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: '알 수 없는 action' }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
