function calculateBestN(subjects = [], count = 5) {
  const sorted = [...subjects].sort((a, b) => (b.marksObtained || 0) - (a.marksObtained || 0)).slice(0, count);
  const totalObtained = sorted.reduce((sum, s) => sum + (s.marksObtained || 0), 0);
  const totalMax = sorted.reduce((sum, s) => sum + (s.maxMarks || 100), 0);
  return totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(2)) : 0;
}

function studentPercentageForCategory(student, category) {
  if (category.calculationMethod === 'BEST_5') {
    return calculateBestN(student.subjects, category.bestOfCount || 5);
  }
  return Number(student.percentage || 0);
}

function doesMatch(student, category) {
  const effectivePercentage = studentPercentageForCategory(student, category);
  const boardOk = !category.board || category.board === student.board;
  const classOk = !category.className || category.className === student.className;
  const percentOk = !category.minPercentage || effectivePercentage >= category.minPercentage;
  const marksOk = !category.minMarks || Number(student.marks || 0) >= category.minMarks;
  const genderOk = category.gender === 'Any' || category.gender === student.gender;
  const schoolTypeOk = category.schoolType === 'Any' || category.schoolType === student.schoolType;
  const cityOk = category.city === 'Any' || category.city === student.city;
  const stateOk = category.state === 'Any' || category.state === student.state;
  return boardOk && classOk && percentOk && marksOk && genderOk && schoolTypeOk && cityOk && stateOk;
}

module.exports = { calculateBestN, studentPercentageForCategory, doesMatch };
